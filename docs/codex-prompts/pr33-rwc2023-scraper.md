# feat: RWC 2023 Wikipedia スクレイパー + 過去データ取り込み

## 目的

RWC 2023（フランス開催）の全試合結果（プールステージ 40 試合 + ノックアウト 8 試合）を
Wikipedia から取得し、既存の試合・大会・順位表パイプラインに乗せる。

これにより:
- `/c/rwc/2027` のプール順位表 UI を 2027 年前に実データで検証できる
- ユーザーが RWC 2023 の試合を日本語レビューで振り返れる（コンテンツ生成は別タスク）

**必ず `design.md` を最初に読んでから実装すること。**

---

## 前提・既存のもの（変更不要）

- `lib/scrapers/fetcher.ts` — `fetchWithPolicy`（rate limit・robots.txt 対応済み）
- `lib/scrapers/wikipedia-season-parser.ts` — 汎用 Wikipedia 行パーサー
- `lib/ingestion/sources/wikipedia-six-nations.ts` — `parseWikipediaSixNationsHtml`（vevent 形式パーサー）
- `lib/ingestion/upsert.ts` — `upsertMatches`
- `lib/ingestion/standings.ts` — `upsertStandings`
- `scripts/import-rugby-championship-results.ts` — スクリプトの構成パターンを参照
- `competition_pools` テーブル — すでに存在（マイグレーション済み）
- teams: `south-africa`, `new-zealand`, `australia`, `argentina`, `japan`, `fiji`,
  `samoa`, `tonga`, `georgia`, `romania`, `uruguay`, `portugal`, `namibia`,
  `england`, `scotland`, `wales`, `ireland`, `france`, `italy` — すでに DB に存在

---

## ステップ 0: Wikipedia HTML 構造の確認（実装前に必ず実施）

以下の URL を `fetchWithPolicy` で取得し、HTML 構造を確認してから実装に進むこと:

```
https://en.wikipedia.org/wiki/2023_Rugby_World_Cup
```

確認すべき点:
- プールセクションの見出し ID（例: `Pool_A`, `pool-a` など）
- プール内ラウンドの区切り方（h3 ID が `Round_1` か `Pool_A_–_Round_1` か）
- ノックアウトセクションの見出し ID（`Quarter-finals`, `Knockout_stage` など）
- vevent クラスの有無（既存 `parseWikipediaSixNationsHtml` が使えるか判断）

---

## 1. `lib/scrapers/wikipedia-rwc-results.ts` を新規作成

```ts
export type RwcMatch = {
  kickoff_at: string;
  home_team_name: string;
  away_team_name: string;
  home_score: number | null;
  away_score: number | null;
  status: "finished" | "scheduled";
  venue: string | null;
  round: number | null;      // 1-4=プール, 5=QF, 6=SF, 7=Bronze, 8=Final
  phase: RwcPhase;
  pool_name: string | null;  // "Pool A"〜"Pool D"、ノックアウトは null
  event_id: string | null;
  source_url: string;
};

export type RwcPhase =
  | "pool"
  | "quarter-final"
  | "semi-final"
  | "bronze-final"
  | "final";

export function parseRwcHtml(html: string, sourceUrl: string): RwcMatch[]
```

**実装ガイドライン（ステップ 0 の確認後に適宜調整）**:

- Cheerio でパース
- プールセクション（Pool A〜D）を検出し、各セクション内の vevent をループ
  - `pool_name` = "Pool A"〜"Pool D"、`phase` = "pool"
  - プール内ラウンド番号は `Round_1`〜`Round_4` の h3/h4 ID から取得
- ノックアウトセクションを検出し、フェーズを判定:
  - "Quarter" を含む見出し → `phase = "quarter-final"`, `round = 5`
  - "Semi" を含む見出し → `phase = "semi-final"`, `round = 6`
  - "Third" または "Bronze" を含む見出し → `phase = "bronze-final"`, `round = 7`
  - "Final" を含む見出し（上記を除く） → `phase = "final"`, `round = 8`
- vevent のない試合は `parseWikipediaSixNationsHtml` がパースできない可能性があるため、
  ステップ 0 で構造確認後に `parseWikipediaSixNationsHtml` を流用するか
  独自ロジックを書くか判断すること

---

## 2. `lib/ingestion/sources/wikipedia-rwc.ts` を新規作成

チームスラグマップと pool 割り当てを定義:

```ts
export const RWC_TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  // Pool A
  "South Africa": "south-africa",
  Ireland: "ireland",
  Scotland: "scotland",
  Tonga: "tonga",
  Romania: "romania",
  // Pool B
  France: "france",
  "New Zealand": "new-zealand",
  Italy: "italy",
  Uruguay: "uruguay",
  Namibia: "namibia",
  // Pool C
  Wales: "wales",
  Australia: "australia",
  Fiji: "fiji",
  Georgia: "georgia",
  Portugal: "portugal",
  // Pool D
  England: "england",
  Japan: "japan",
  Argentina: "argentina",
  Samoa: "samoa",
  Chile: "chile",
};

// team_slug → pool_name
export const RWC_2023_POOL_ASSIGNMENTS: Record<string, string> = {
  "south-africa": "Pool A",
  ireland: "Pool A",
  scotland: "Pool A",
  tonga: "Pool A",
  romania: "Pool A",
  france: "Pool B",
  "new-zealand": "Pool B",
  italy: "Pool B",
  uruguay: "Pool B",
  namibia: "Pool B",
  wales: "Pool C",
  australia: "Pool C",
  fiji: "Pool C",
  georgia: "Pool C",
  portugal: "Pool C",
  england: "Pool D",
  japan: "Pool D",
  argentina: "Pool D",
  samoa: "Pool D",
  chile: "Pool D",
};

export const RWC_2023_WIKIPEDIA_URL =
  "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup";
export const RWC_2023_COMPETITION_SLUG = "rwc-2023";
export const RWC_2023_FAMILY = "rwc";
export const RWC_2023_SEASON = "2023";
```

---

## 3. `scripts/import-rwc-results.ts` を新規作成

`scripts/import-rugby-championship-results.ts` を参考にした構成。

引数: `--season <YYYY>`（現時点は `2023` のみ対応）

処理フロー:
1. `fetchWithPolicy(RWC_2023_WIKIPEDIA_URL)` で HTML 取得
2. `parseRwcHtml` でパース
3. チーム名 → slug 変換（`RWC_TEAM_SLUG_BY_WIKIPEDIA_NAME`）
4. slug → team_id 変換（DB lookup）
5. competition を upsert（`family='rwc'`, `season='2023'`, `slug='rwc-2023'`）
   - `start_date` / `end_date` はパース済みの試合日程から自動算出
6. 試合を `upsertMatches` で upsert
   - `external_ids` に `{ wikipedia_round, wikipedia_event_id, phase, pool_name }` を格納
   - `status='finished'` の試合は `home_score` / `away_score` も設定
7. `competition_pools` を upsert（`RWC_2023_POOL_ASSIGNMENTS` から生成）
8. `calculate-standings.ts` 相当のロジックで `competition_standings` を更新
   （既存 `scripts/calculate-standings.ts --slug rwc-2023` を呼び出す形でも可）

完了時にサマリーを出力:
```
Upserted competition: rwc-2023
Teams resolved: 20/20
Matches upserted: 48 (40 pool + 8 knockout)
Pool assignments written: 20
```

---

## 4. DB マイグレーション（新規）

`supabase/migrations/<timestamp>_add_chile_team.sql`

```sql
-- Chile（RWC 2023 Pool D 出場）
INSERT INTO public.teams (slug, name, short_code, country)
VALUES ('chile', 'Chile Cóndores', 'CHI', 'CHL')
ON CONFLICT (slug) DO NOTHING;
```

`competition_pools` はスクリプト（ステップ 3）が upsert するため、
マイグレーションでは teams の追加のみでよい。

---

## 5. `lib/format/team-identity.ts` に Chile を追加

```ts
// TEAM_IDENTITY に追加
chile: { color: "#D52B1E", flag: "🇨🇱" },

// TEAM_STRIPES に追加
chile: ["#D52B1E", "#FFFFFF"],

// TEAM_FLAGS に追加
chile: "🇨🇱",
```

---

## 変更・作成するファイル

| ファイル | 操作 |
|---------|------|
| `lib/scrapers/wikipedia-rwc-results.ts` | 新規作成 |
| `lib/ingestion/sources/wikipedia-rwc.ts` | 新規作成 |
| `scripts/import-rwc-results.ts` | 新規作成 |
| `supabase/migrations/<ts>_add_chile_team.sql` | 新規作成 |
| `lib/format/team-identity.ts` | Chile を追加 |

---

## 変更しないこと

- `lib/ingestion/upsert.ts` のインターフェース
- `competition_pools` テーブルのスキーマ
- 既存のスクレイパー・ingestion ソース

---

## テスト

`tests/scrapers/wikipedia-rwc-results.test.ts` を作成:
- 正常系: プール試合のパース（pool_name・round・phase が正しい）
- 正常系: ノックアウト試合のパース（QF/SF/Bronze/Final の phase・round が正しい）
- 異常系: 存在しないチーム名でエラーを投げる

実際の Wikipedia HTML を使った snapshot テストも推奨（既存の `tests/scrapers/` 以下を参照）。

---

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm build` 成功
- `pnpm tsx scripts/import-rwc-results.ts --season 2023` が成功し、
  サマリーで 48 試合前後が upserted と表示される
- `pnpm tsx scripts/calculate-standings.ts --slug rwc-2023` が成功する
- Supabase で `SELECT count(*) FROM competition_pools WHERE competition_id = (SELECT id FROM competitions WHERE slug = 'rwc-2023')` が 20 を返す
- 開発環境で `/c/rwc/2027` のプール順位表 UI が `rwc-2023` データで正常表示される
  （ローカルで `RWC_2023_COMPETITION_SLUG` を `rwc-2027` に変えてテストすること）

## ブランチ・PR

- ブランチ: `feat/rwc2023-scraper`
- PR タイトル: `Feat: RWC 2023 Wikipedia scraper and historical data import`
