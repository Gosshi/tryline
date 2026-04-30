# 試合イベント取り込み（p1-match-events-ingestion）

## 背景

現在 `match_events` テーブルはスキーマが存在するが常に空のため、LLM のレビュー生成が「誰がトライを取ったか」「何分に流れが変わったか」を語れない。Wikipedia の個別試合ページからスコアリングイベント（トライ・コンバージョン・ペナルティゴール・ドロップゴール・カード）を取り込み、アセンブル段階でレビュー用コンテキストとして LLM に渡す。

## スコープ

**対象:**
- `lib/scrapers/wikipedia-match-events.ts` — 個別試合ページからイベントを抽出するスクレイパー（新規）
- `lib/ingestion/events.ts` — match_events upsert ロジック（新規）
- `lib/ingestion/results.ts` — 結果取り込み時にイベントも取り込むよう拡張
- `lib/llm/stages/assemble.ts` — finished 試合の match_events をコンテキストに追加
- `lib/llm/types.ts` — `AssembledContentInput` に `match_events` フィールド追加
- `lib/llm/prompts/generate-recap.ts` — match_events を使うよう更新（PROMPT_VERSION: `recap@1.3.0`）
- `scripts/backfill-match-events.ts` — 2020-2026 過去試合の一括バックフィルスクリプト（新規）

**対象外:**
- `generate-preview.ts` のプロンプト変更（preview は試合前のため events 不要）
- `match_events` テーブルのスキーマ変更（既存のまま使用）
- 2027 以外のリーグ

## データモデル変更

### スキーマ変更: なし

既存の `match_events` テーブルをそのまま使用する:

```
match_events (
  id uuid primary key,
  match_id uuid references matches not null,
  type text not null,
  minute integer,            -- null 可（取得できない場合）
  player_id uuid,            -- null 可（best-effort マッチング）
  team_id uuid not null,
  metadata jsonb not null,   -- { player_name: string, is_penalty_try?: boolean }
  created_at timestamptz
)
```

### イベント種別

`type` に入る値:

| type | 説明 |
|---|---|
| `try` | トライ（ペナルティトライは `metadata.is_penalty_try = true`） |
| `conversion` | コンバージョン（成功のみ） |
| `penalty_goal` | ペナルティゴール（成功のみ） |
| `drop_goal` | ドロップゴール |
| `yellow_card` | イエローカード |
| `red_card` | レッドカード |

## Wikipedia 個別試合ページの構造

Six Nations の個別試合 Wikipedia ページ（例: `https://en.wikipedia.org/wiki/2027_Six_Nations_Championship_–_England_v_France`）には、以下の形式でスコアリング情報を含む infobox がある:

```
| Tries        | Player A (23'), Player B (67')  | Player C (12')
| Cons         | Player D (24', 68')             | Player E (13')
| Pens         | Player D (5', 35')              | Player E (8', 52', 65')
| Drop goals   | none                            | Player F (44')
| Yellow cards | Player G (56')                  | none
| Red cards    | none                            | none
```

左列がホームチーム、右列がアウェイチーム。`none` / `—` / 空文字は「イベントなし」として扱う。`(pen)` はペナルティトライを示す（`metadata.is_penalty_try = true`）。

### URL 構築ルール

```
https://en.wikipedia.org/wiki/{year}_Six_Nations_Championship_–_{HomeTeam}_v_{AwayTeam}
```

- `{year}` は `competitions.season`
- `{HomeTeam}` / `{AwayTeam}` は Wikipedia 正式名: `England`, `France`, `Ireland`, `Scotland`, `Wales`, `Italy`
- en-dash（`–`、U+2013）を使用すること（ハイフン `-` ではない）
- `encodeURIComponent` または `new URL` で正しく URL エンコードすること
- 404 等でページが存在しない場合は `console.warn` を出してスキップ（エラーで止めない）
- infobox が見つからない場合も同様にスキップ

## 実装詳細

### `lib/scrapers/wikipedia-match-events.ts`

```typescript
export type ParsedMatchEvent = {
  type: 'try' | 'conversion' | 'penalty_goal' | 'drop_goal' | 'yellow_card' | 'red_card';
  minute: number | null;
  teamSide: 'home' | 'away';
  playerName: string;
  isPenaltyTry: boolean;
};

export async function scrapeMatchEvents(matchUrl: string): Promise<ParsedMatchEvent[]>
```

- `fetchWithPolicy` を必ず使用（直接 `fetch` 禁止）
- cheerio で infobox の scoring 行をパース
- minute は `(23')` 形式から数値を抽出。複数分（`23', 45'`）は個別イベントとして展開する

### `lib/ingestion/events.ts`

```typescript
export async function upsertMatchEvents(params: {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  events: ParsedMatchEvent[];
}): Promise<{ inserted: number }>
```

- 冪等性確保: 実行前に当該 `match_id` の既存 `match_events` を DELETE してから INSERT
- `player_id` の解決: `players` テーブルを `name` で大文字小文字無視の部分一致検索。一意に特定できない場合は `null`
- `metadata`: `{ player_name: string, is_penalty_try?: boolean }`

### `lib/ingestion/results.ts` の拡張

`ingestSixNations2027Results` の末尾で、今回の実行で `status` が `finished` に更新されたマッチに対してイベント取り込みを実行する。戻り値の `counts.events_inserted` を実際の件数に更新する。

### `lib/llm/types.ts` の変更

`AssembledContentInput` に以下を追加:

```typescript
match_events: Array<{
  type: string;
  minute: number | null;
  team_name: string;
  player_name: string;
  is_penalty_try?: boolean;
}>;
```

### `lib/llm/stages/assemble.ts` の変更

- `match.status === 'finished'` の場合のみ DB から `match_events` を取得してセット
- `match.status === 'scheduled'` の場合は `match_events: []` を返す（preview 用）

### `lib/llm/prompts/generate-recap.ts` の変更

`match_events.length > 0` の場合に以下ブロックをプロンプトに追加する:

```
スコアリングイベント（tryスコアラー・コンバージョン・ペナルティ・カード等）は以下のデータのみを根拠に記述すること:
${JSON.stringify(assembled.match_events)}
```

`match_events` が空配列の場合はこのブロックを省略する（プロンプトが壊れないこと）。`PROMPT_VERSION` は `recap@1.3.0` に更新する。

### `scripts/backfill-match-events.ts`

```
pnpm tsx scripts/backfill-match-events.ts [--year=2022] [--dry-run]
```

- `--year` 省略時は `matches` テーブルの全 `status='finished'` かつ `match_events` が空の試合を対象とする
- 各試合について Wikipedia URL を構築 → `scrapeMatchEvents` → `upsertMatchEvents`
- `--dry-run` で実際の upsert をスキップし取得件数のみログ出力
- 試合ごとに 1 秒の待機を入れて rate limit を守る

## API サーフェス

変更なし（内部処理のみ）。

## UI サーフェス

変更なし。試合詳細ページに `match_events` の直接表示はしない。LLM が生成したレビュー本文の中で事実として語られる形になる。

## LLM 連携

- アセンブル段階（段階 1）に match_events の DB クエリを追加
- ナラティブ生成（段階 3）の recap プロンプトが match_events を参照
- `PROMPT_VERSION`: `recap@1.3.0`

## 受け入れ条件

- [ ] `scrapeMatchEvents` が Six Nations 個別試合ページからトライ・コンバージョン・ペナルティ・ドロップゴール・カードをパースできる
- [ ] 複数 minute（`23', 45'`）が個別イベントとして展開される
- [ ] Wikipedia ページが存在しない場合にエラーで止まらず空配列を返す
- [ ] `upsertMatchEvents` が同じ試合に 2 回実行しても重複しない（冪等）
- [ ] `ingestSixNations2027Results` 実行後に新たに finished になった試合の `match_events` が DB に存在する
- [ ] `assembleMatchContentInput` が `finished` 試合で `match_events` を返す（空でない）
- [ ] `assembleMatchContentInput` が `scheduled` 試合で `match_events = []` を返す
- [ ] `backfill-match-events.ts --dry-run` が DB を変更せず対象件数をログ出力する
- [ ] `backfill-match-events.ts` 実行後に 2020〜2026 の finished 試合に match_events が存在する
- [ ] recap 生成のレビュー本文にトライスコアラー等の具体名が含まれる
- [ ] `pnpm lint` / `pnpm typecheck` が通る

## 未解決の質問

現時点なし。
