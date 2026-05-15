# Wikipedia 試合イベント シード：Premiership/URC 得点データ投入

## 背景

`backfill-club-match-details.ts` と `lib/scrapers/wikipedia-club-match-details.ts` は
実装済みだが、`matches.external_ids` に `wikipedia_url` が未設定のため 0件しか処理されない。

Wikipedia の調査で以下が判明した:
- **Premiership 2025-26**: `https://en.wikipedia.org/wiki/2025%E2%80%9326_Premiership_Rugby`
  得点者（トライ・コンバージョン・PG・分）が各試合ごとに掲載されている
- **URC 2025-26**: `https://en.wikipedia.org/wiki/2025%E2%80%9326_United_Rugby_Championship`
  同様に得点者データあり
- **ラインアップ（先発15名）**: いずれも掲載なし

このため:
1. Wikipedia シーズンページを解析して `matches.external_ids` を埋めるシードスクリプトを実装する
2. `backfill-club-match-details.ts` のラインアップ処理を無効化する

## スコープ

対象:
- `scripts/seed-wikipedia-external-ids.ts` — 新規作成
- `lib/scrapers/wikipedia-season-parser.ts` — 新規作成（シーズンページのパーサー）
- `lib/scrapers/wikipedia-team-name-map.ts` — 新規作成（チーム名の正規化マップ）
- `scripts/backfill-club-match-details.ts` — ラインアップ処理をスキップするよう修正

対象外:
- `app/matches/[id]/page.tsx`（変更なし）
- `match_lineups` テーブルへのデータ投入（今回は対象外）
- Top 14 / SRP（今回は Premiership・URC のみ）

## Wikipedia ページの構造

### 対象 URL

```ts
const WIKIPEDIA_SEASON_URLS: Record<string, string> = {
  "premiership-2025-26": "https://en.wikipedia.org/wiki/2025%E2%80%9326_Premiership_Rugby",
  "urc-2025-26":         "https://en.wikipedia.org/wiki/2025%E2%80%9326_United_Rugby_Championship",
};
```

### HTML 構造

各試合は `div.vevent` として存在し、以下の要素を含む:
- ホームチーム名: チームへの `<a>` リンクのテキスト（先頭）
- アウェイチーム名: チームへの `<a>` リンクのテキスト（後尾）
- 日付: `<time>` 要素または `abbr.dtstart` の `title` / テキスト
- セクション ID: `div.vevent` 自身の `id` 属性、または最も近い祖先の `id` 属性

**実装方針:**
- `cheerio` で HTML を解析する（既に `lib/scrapers/wikipedia-club-match-details.ts` で使用中）
- `div.vevent` を列挙し、各要素からチーム名・日付を抽出する
- 抽出したチーム名を後述のマップと部分一致でDBの `teams.name` にマッチングする
- セクション ID が取れない場合は `eventId: null`（`getWikipediaSource` は `null` を許容済み）

### チーム名の正規化マップ（`lib/scrapers/wikipedia-team-name-map.ts`）

Wikipedia の表記と DB の `teams.name` が一致しない場合に使用する。

```ts
export const WIKIPEDIA_TEAM_NAME_MAP: Record<string, string> = {
  // key: Wikipedia 表記, value: DB の teams.name
  "Gloucester":   "Gloucester Rugby",
  "Sale":         "Sale Sharks",
  "Bristol":      "Bristol Bears",
  "Newcastle":    "Newcastle Falcons",
  "Exeter":       "Exeter Chiefs",
  "Leicester":    "Leicester Tigers",
  "Northampton":  "Northampton Saints",
  // URC
  "Cardiff":      "Cardiff Rugby",
  "Glasgow":      "Glasgow Warriors",
  "Edinburgh":    "Edinburgh Rugby",
};
```

マッチング順序: 完全一致 → マップ参照 → 部分一致（`teams.name.includes(wikiName)`）。
いずれも失敗した場合は警告ログを出してその試合をスキップする。

## 実装: `scripts/seed-wikipedia-external-ids.ts`

```
Usage:
  pnpm tsx scripts/seed-wikipedia-external-ids.ts [--family=premiership] [--dry-run]
```

処理フロー:
1. `WIKIPEDIA_SEASON_URLS` からターゲット URL と competition slug を決定する
2. `fetchWithPolicy` でページを取得する（既存の fetcher を使う）
3. `parseWikipediaSeasonMatches(html)` で試合一覧（チーム名・日付・sectionId）を抽出する
4. DB の `matches` を `competition.slug` と `status = 'finished'` でクエリする
5. Wikipedia の各試合エントリに対して DB レコードとマッチングし、`external_ids` を upsert する:
   ```ts
   external_ids: {
     ...existingExternalIds,
     wikipedia_url: seasonUrl,
     wikipedia_event_id: sectionId ?? undefined,
   }
   ```
6. `--dry-run` の場合は upsert せずマッチ結果を標準出力に表示する

## 実装: `backfill-club-match-details.ts` の修正

`lineup` は取得せず `events` のみ処理するよう変更する。

```ts
// 変更前: lineup も upsert していた
const { events, lineup } = await scrapeWikipediaClubMatchDetails(source);

// 変更後: events のみ処理
const { events } = await scrapeWikipediaClubMatchDetails(source);
// lineup の upsert 処理を削除する
```

## 実行手順（実装後に Owner が実行する）

```bash
# Step 1: external_ids をシード（dry-run で確認）
set -a; source .env.production.local; set +a
pnpm tsx scripts/seed-wikipedia-external-ids.ts --family=premiership --dry-run

# Step 2: 問題なければ本番実行
pnpm tsx scripts/seed-wikipedia-external-ids.ts --family=premiership

# Step 3: イベントをバックフィル（dry-run で確認）
pnpm tsx scripts/backfill-club-match-details.ts --family=premiership --dry-run --limit=10

# Step 4: 本番実行
pnpm tsx scripts/backfill-club-match-details.ts --family=premiership --limit=50

# Step 5: URC も同様に実行
pnpm tsx scripts/seed-wikipedia-external-ids.ts --family=urc
pnpm tsx scripts/backfill-club-match-details.ts --family=urc --limit=50
```

## 変更ファイル

- `scripts/seed-wikipedia-external-ids.ts`（新規）
- `lib/scrapers/wikipedia-season-parser.ts`（新規）
- `lib/scrapers/wikipedia-team-name-map.ts`（新規）
- `scripts/backfill-club-match-details.ts`（lineup 処理をスキップ）

## 受け入れ条件

- [ ] `seed-wikipedia-external-ids.ts --family=premiership --dry-run` でマッチ件数が 1 件以上表示される
- [ ] `--dry-run` なしで実行後、`backfill-club-match-details.ts` を実行すると `events > 0` になる
- [ ] Premiership の終了済み試合詳細ページで得点経過グラフが表示される
- [ ] ラインアップセクションは非表示のまま（データなし = 正常）
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る
