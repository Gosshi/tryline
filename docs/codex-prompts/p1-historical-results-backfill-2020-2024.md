# Codex プロンプト: p1-historical-results-backfill-2020-2024

以下の内容をそのまま Codex にコピペして使用します。

---

`/specs/p1-historical-results-backfill-2020-2024.md` の仕様を実装してください。

## コンテキスト

- プロジェクト規約は `CLAUDE.md` を必ず最初に読む
- 前提となる基盤（すべて実装済み）:
  - `lib/ingestion/sources/wikipedia-six-nations.ts` — 汎用 Wikipedia パーサー（`parseWikipediaSixNationsHtml`）
  - `scripts/extract-six-nations-wikipedia.ts` — Wikipedia HTML → JSON 出力スクリプト（現在は 2025/2026 のみ対応）
  - `scripts/import-six-nations-results.ts` — JSON → DB upsert スクリプト（現在は 2025/2026 のみ対応）
  - `data/six-nations/2025-results.json` / `2026-results.json` — 出力 JSON のスキーマ確認用

## 実装前に必ず読むファイル

1. `specs/p1-historical-results-backfill-2020-2024.md` — 本仕様書（Wikipedia URL・competition dates 等）
2. `scripts/extract-six-nations-wikipedia.ts` — 現在の year バリデーションと URL マッピングを確認する
3. `scripts/import-six-nations-results.ts` — 現在の year バリデーションと competition upsert を確認する
4. `data/six-nations/2025-results.json` — 出力 JSON スキーマの確認

## 要件

### Step 1: スクリプトの年度拡張

`scripts/extract-six-nations-wikipedia.ts`:
- 受け付ける year を `2020〜2026` に拡張する
- Wikipedia URL マッピングに 2020〜2024 を追加する（URL は仕様書参照）

`scripts/import-six-nations-results.ts`:
- 受け付ける year を `2020〜2026` に拡張する
- competition upsert に 5 年分を追加する（slug / name / dates は仕様書のテーブル参照）

### Step 2: JSON データ生成（実際に実行すること）

```
pnpm tsx scripts/extract-six-nations-wikipedia.ts 2020
pnpm tsx scripts/extract-six-nations-wikipedia.ts 2021
pnpm tsx scripts/extract-six-nations-wikipedia.ts 2022
pnpm tsx scripts/extract-six-nations-wikipedia.ts 2023
pnpm tsx scripts/extract-six-nations-wikipedia.ts 2024
```

各年度で 15 試合が取得できない場合は Owner に報告してから止まること（強引にスキップしない）。

### Step 3: DB インポート（実際に実行すること）

```
pnpm tsx scripts/import-six-nations-results.ts 2020
pnpm tsx scripts/import-six-nations-results.ts 2021
pnpm tsx scripts/import-six-nations-results.ts 2022
pnpm tsx scripts/import-six-nations-results.ts 2023
pnpm tsx scripts/import-six-nations-results.ts 2024
```

### Step 4: JSON ファイルのコミット

生成した `data/six-nations/2020-results.json` 〜 `data/six-nations/2024-results.json` を git add してコミットする。

## 注意事項

- `lib/llm/stages/assemble.ts` は変更しない
- `vercel.json` や cron エンドポイントは追加しない
- 新規 npm パッケージは追加しない
- `fetchWithPolicy` を必ず使う（直接 `fetch` は使わない）
- `CLAUDE.md` / `/specs/*.md` / `/docs/decisions.md` を書き換えない

## 完了時に必ず報告すること

- 各年度の extractor 実行結果（何試合取得できたか）
- importer の実行結果（各年度の upsert 件数）
- `pnpm lint` / `pnpm typecheck` の結果
