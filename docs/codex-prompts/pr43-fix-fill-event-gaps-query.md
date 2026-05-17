# PR43: fill-event-gaps のクエリ設計修正

## 背景

`app/api/cron/fill-event-gaps/route.ts` は cron モード（ボディなし）で実行したとき、
`match_events` が 0 件かつ `external_ids.wikipedia_url` がある試合を対象として
Wikipedia からイベントを取得する。

しかし現在のクエリは:

```typescript
client.from("matches").select(...).eq("status", "finished").limit(20)
```

で `finished` 状態の試合を**任意の順に 20 件**取得したあと、アプリ側で
`match_events.length === 0` を後フィルタする。

### 問題

- 20 件がすでに events を持つ試合で埋まると「処理対象 0 件」で終了する
- 実際に DB には 301 件（URC 138・SRP 83・Premiership 40・Autumn Nations 32 等）の
  events 欠損試合が積み上がっており、1 回の cron では数件しか処理されないか最悪 0 件になる

### 既存の `matchIds` ボディパラメータ

`bodySchema` に `matchIds: z.array(z.string().uuid()).min(1).max(20).optional()` がすでにあり、
手動で特定試合を指定できるが、上限が 20 件と小さい。

## スコープ

対象:
- `app/api/cron/fill-event-gaps/route.ts`

対象外:
- `upsertMatchEvents` の実装
- Wikipedia パーサの変更
- `generate-content` の変更

## 変更詳細

### 1. クエリをDB レベルで絞り込む（2 クエリ方式）

cron モード（`matchIds` なし）のクエリを以下に変更する。

```typescript
const CRON_BATCH_SIZE = 25;

// Step A: events を持つ match_id をすべて取得
const { data: eventedRows, error: eventedError } = await client
  .from("match_events")
  .select("match_id");

if (eventedError) {
  return NextResponse.json({ error: eventedError.message }, { status: 500 });
}

const matchIdsWithEvents = new Set(
  (eventedRows ?? []).map((r) => r.match_id),
);

// Step B: finished 試合を直近 kickoff 順で取得
let matchQuery = client
  .from("matches")
  .select("id, home_team_id, away_team_id, external_ids")
  .eq("status", "finished")
  .order("kickoff_at", { ascending: false });

if (body.matchIds) {
  matchQuery = matchQuery.in("id", body.matchIds);
} else {
  matchQuery = matchQuery.limit(CRON_BATCH_SIZE);
}

const { data, error } = await matchQuery;

// Step C: events が 0 件 かつ wikipedia_url ある試合だけ残す
const gaps = (data ?? []).filter(
  (match) =>
    !matchIdsWithEvents.has(match.id) &&
    getWikipediaSource(match.external_ids) !== null,
);
```

`MatchGapRow` 型の `match_events: Array<{ id: string }>` フィールドは不要になるため削除する。

### 2. `bodySchema` の `max` を緩和

```typescript
// 変更前
matchIds: z.array(z.string().uuid()).min(1).max(20).optional(),

// 変更後
matchIds: z.array(z.string().uuid()).min(1).max(40).optional(),
```

手動バックフィル時に一度に 40 件まで指定できるようにする。
40 件 × 1500ms スリープ ≒ 60 秒で `maxDuration = 60` に収まる。

### 3. `matchIds` 指定時は `limit` をスキップ

上記の変更後、`matchIds` 指定時は `.in("id", body.matchIds)` のみで件数が絞られるため、
`limit` は不要になる（コードロジックから自然に消える）。

## 受け入れ条件

- `matchIds` なしで POST したとき、直近 kickoff の events 欠損試合を最大 25 件処理する
- `matchIds` ありで POST したとき、指定した ID（最大 40 件）の events を取得する
- すでに events を持つ試合は処理対象にならない
- レスポンスは `{"filled": N, "gaps": N, "errors": []}` の形式
- `pnpm build` でエラーなし
- `maxDuration = 60` の範囲内で完了する

## 実行方法（実装後のバックフィル手順）

### cron モード（自動・直近 25 件）

```bash
curl -X POST https://tryline-six.vercel.app/api/cron/fill-event-gaps \
  -H "Authorization: Bearer $CRON_SECRET"
```

### ターゲット指定モード（RWC 2023 ノックアウト）

```bash
curl -X POST https://tryline-six.vercel.app/api/cron/fill-event-gaps \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"matchIds": ["d31077ee-92c6-480e-bbef-87f955e6bc1d", "1bcbe5ff-d0f4-4568-ac9b-15aedba2e3f8"]}'
```

events 取得後に `generate-content` を recap で呼び出す。

## 参考ファイル

- `app/api/cron/fill-event-gaps/route.ts` — 対象ファイル（183 行）
- `lib/ingestion/events.ts` — `upsertMatchEvents`（変更なし）
- `lib/scrapers/wikipedia-match-events.ts` — `parseMatchEventsFromVeventHtml`（変更なし）

## 未解決の質問

- `match_events` テーブルが将来的に大きくなった場合、Step A が遅くなる可能性がある。
  その際は `match_events(match_id)` に対してインデックスの有無を確認し、なければ追加すること。
  現時点では件数が少ないため問題ない。
