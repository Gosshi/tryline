# Codex プロンプト: p1-historical-results-backfill

以下の内容をそのまま Codex にコピペして使用します。

---

`/specs/p1-historical-results-backfill.md` の仕様を実装してください。

## コンテキスト

- プロジェクト規約は `CLAUDE.md` を必ず最初に読む
- 前提となる基盤:
  - `lib/ingestion/sources/wikipedia-six-nations-2027.ts` — **既存の Wikipedia HTML パーサー。流用する**
  - `lib/ingestion/fixtures.ts` — competition / team lookup / upsert のパターン参照
  - `lib/scrapers/fetcher.ts` — `fetchWithPolicy`（robots.txt チェック込み）
  - `lib/db/server.ts` — Supabase クライアント

## 実装前に必ず読むファイル

1. `lib/ingestion/sources/wikipedia-six-nations-2027.ts` — `parseWikipediaSixNations2027Html` の実装を確認する
2. `lib/ingestion/fixtures.ts` — competition/team lookup と upsert の実装パターンを確認する
3. `lib/scrapers/fetcher.ts` — `fetchWithPolicy` のシグネチャを確認する
4. `lib/db/server.ts` — Supabase クライアントの取得方法を確認する

## 要件

### Step 1: パーサーの汎用化

`lib/ingestion/sources/wikipedia-six-nations-2027.ts` の `parseWikipediaSixNations2027Html` を:

```typescript
// lib/ingestion/sources/wikipedia-six-nations.ts（新規）
export function parseWikipediaSixNationsHtml(html: string): ParsedWikipediaMatch[]
```

として汎用関数に切り出す。既存の `wikipedia-six-nations-2027.ts` からは後方互換のため re-export する:

```typescript
export { parseWikipediaSixNationsHtml as parseWikipediaSixNations2027Html } from "./wikipedia-six-nations";
```

### Step 2: extractor スクリプト

`scripts/extract-six-nations-wikipedia.ts` を作成:

```
pnpm tsx scripts/extract-six-nations-wikipedia.ts 2025
pnpm tsx scripts/extract-six-nations-wikipedia.ts 2026
```

- コマンドライン引数から `year`（2025 or 2026）を取得。それ以外は `process.exit(1)`
- `fetchWithPolicy` で Wikipedia URL を取得:
  - 2025: `https://en.wikipedia.org/wiki/2025_Six_Nations_Championship`
  - 2026: `https://en.wikipedia.org/wiki/2026_Six_Nations_Championship`
- `parseWikipediaSixNationsHtml` でパース
- **試合数が 15 件でなければ `console.error` + `process.exit(1)`**
- チーム名を slug にマッピング（Wikipedia の表記 → `england` / `france` / `ireland` / `scotland` / `wales` / `italy`）
  - マッピングできないチーム名があれば `process.exit(1)`
- `data/six-nations/{year}-results.json` に書き出す（ディレクトリがなければ作成）

出力 JSON の型（仕様書記載の `HistoricalMatchResult` の配列）:

```typescript
type HistoricalMatchResult = {
  season: number;
  round: number | null;
  kickoff_at: string;         // ISO 8601 UTC
  home_team_slug: string;
  away_team_slug: string;
  home_score: number;
  away_score: number;
  venue: string | null;
  source_url: string;
  wikipedia_event_id: string | null;
};
```

### Step 3: importer スクリプト

`scripts/import-six-nations-results.ts` を作成:

```
pnpm tsx scripts/import-six-nations-results.ts 2025
pnpm tsx scripts/import-six-nations-results.ts 2026
```

- コマンドライン引数から `year` を取得。それ以外は `process.exit(1)`
- `data/six-nations/{year}-results.json` を読み込む
- **JSON の試合数が 15 件でなければ `process.exit(1)`**
- competition を upsert（slug: `six-nations-2025` or `six-nations-2026`、name: `Six Nations 2025` 等、dates は仕様書参照）
- teams を slug で lookup し id マップを作成（未知の slug があれば `process.exit(1)`）
- matches を以下で upsert:
  - `status = 'finished'`
  - `external_ids` に source metadata（仕様書の JSON 形式参照）
  - conflict キー: `competition_id + home_team_id + away_team_id + kickoff_at`
  - `on conflict do update` で冪等に
- 完了後: `console.log(`Upserted ${n} matches for Six Nations ${year}`)` を出力

### Step 4: JSON データファイル生成

extractor スクリプトを実装後、実際に実行して JSON ファイルを生成しリポジトリにコミットする:

```
pnpm tsx scripts/extract-six-nations-wikipedia.ts 2025
pnpm tsx scripts/extract-six-nations-wikipedia.ts 2026
```

生成された `data/six-nations/2025-results.json` と `data/six-nations/2026-results.json` を git add してコミットする。

## 注意事項

- `scripts/` ディレクトリは TypeScript で書き、`tsconfig.json` のパスエイリアス（`@/`）を使用する
- `getSupabaseServerClient` は環境変数（`.env.local`）を自動で読むので `dotenv` の追加は不要
- `fetchWithPolicy` を必ず使うこと（直接 `fetch` を使わない）
- スコアが取れない試合（`home_score === null`）は extractor でスキップ or エラー終了する（過去試合なので全試合スコアがあるはず）

## 成果物の定義

- `pnpm lint` / `pnpm typecheck` が通る
- `data/six-nations/2025-results.json`（15 試合）と `data/six-nations/2026-results.json`（15 試合）がコミットされている
- `pnpm tsx scripts/import-six-nations-results.ts 2025` と `2026` が成功する
- import 後に `matches` テーブルに `status='finished'` のレコードが 30 件増えている

## 完了時に必ず報告すること

- extractor を実際に実行した結果（2025/2026 それぞれ何試合取得できたか）
- importer の実行結果（upsert 件数）
- `pnpm lint` / `pnpm typecheck` の結果

## やってはいけないこと

- `lib/llm/stages/assemble.ts` の変更
- `vercel.json` や cron エンドポイントの追加
- 新規 npm パッケージの追加
- 直接 `fetch` を使う（必ず `fetchWithPolicy` 経由）
- `CLAUDE.md` / `/specs/*.md` / `/docs/decisions.md` の書き換え
