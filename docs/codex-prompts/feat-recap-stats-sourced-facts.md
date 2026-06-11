# Codex プロンプト: recap 向け sourced_facts のスタッツ志向化

仕様: `specs/feat-recap-stats-sourced-facts.md` を参照（検索意図の全文・ルール・許可リストは仕様書に記載）。

## タスク

sourced_facts の web 検索プロンプトを content_type で分岐し、recap では試合後スタッツ（ポゼッション・タックル数等）・公式 MOM・記録・監督コメントを狙って取得する。

## 変更ファイルと内容

### 1) `lib/llm/sourced-facts/fetch.ts`

- `buildSearchPrompt` の `Search intent:` ブロックを `contentType === "recap"` で分岐（文言は仕様書のコードをそのまま使用）
- recap 時のみ Rules に数値スタッツの記載形式ルールを1行追加（仕様書参照）
- `SEARCH_PROMPT_VERSION` を `"sourced-facts@1.1.0"` に変更
- **確認事項**: `loadSourcedFactsForMatch` が finished 試合（recap 生成時）でも検索を実行するか確認。preview 用 freshness window（`PREVIEW_REFRESH_WINDOW_HOURS` 等）が recap をブロックする構造なら、recap は「保存済み facts が無ければ取得する」分岐を追加

### 2) `lib/llm/sourced-facts/allowlist.ts`

`MEDIA_DOMAINS` に `"bbc.com"` と `"bbc.co.uk"` を追加。

## テスト

- `buildSearchPrompt(match, "recap")`: 「post-match statistics」「Player of the Match」を含み、「lineup changes」を含まない
- `buildSearchPrompt(match, "preview")`: 現行出力と同一（既存テストがあれば変更不要のはず）
- `isAllowedSourcedFactDomain("bbc.com")` → true、`isAllowedSourcedFactDomain("www.bbc.co.uk")` → true
- `SEARCH_PROMPT_VERSION` のアサート更新（既存テストにあれば）

## 完了の定義

- `pnpm tsc --noEmit` が通る
- `pnpm test` が通る
- 変更ファイル: `fetch.ts`・`allowlist.ts`・テストのみ。生成プロンプト（generate-recap.ts 等）は触らない
- **PR の base は必ず `main` にすること**
