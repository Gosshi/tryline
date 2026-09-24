# Codex 指示書: レビューの本文プロンプトを B2 に切り替える

仕様書: `specs/feat-recap-b2-production.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## やること

1. `lib/llm/stages/generate-narrative.ts` に `selectProductionPromptVariant` を足す。日本語のレビューで得点イベントがあるときだけ `"B"`、それ以外は `"A"` を返す。`generateNarrative` は `options.promptVariant ?? selectProductionPromptVariant(...)` で使う版を決め、使った版を戻り値に入れる。
2. `lib/llm/pipeline.ts` で、未指定の `promptVariant` を `"A"` に置き換えるのをやめ、`undefined` のまま渡す。英語で B を使えない検査は、明示したときだけ行う。試し焼きの記録には実際に使った版を入れる。
3. `lib/llm/prompts/variant-b/generate-recap-b.ts` の `PROMPT_VERSION` を `recap@5.0.0` にする。A/B スクリプトとテストの `recap-b@0.2.0` を合わせる。

## 触るファイル

- `lib/llm/stages/generate-narrative.ts`
- `lib/llm/pipeline.ts`
- `lib/llm/prompts/variant-b/generate-recap-b.ts`（`PROMPT_VERSION` だけ）
- `scripts/ab-content-prompts.ts`（版番号の前提がある場合だけ）
- テスト

## 守ること

- プロンプトの文言は A・B とも変えない。
- `buildJapaneseNarrativePrompt` の既定（第 2 引数なしは A）は変えない。
- プレビュー、得点イベント 0 件のレビュー、英語は A のまま。
- QA、ガード、加筆、人名照合は変えない。
- 本番の既定を A に戻すときに `selectProductionPromptVariant` だけを変えれば済む形にする。

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行する（**3 つとも必ず実行し、結果を完了報告に含める**）。
- 「壊して落ちる」確認（コミットしない）: `selectProductionPromptVariant` が常に `"A"` を返すようにすると、受け入れ条件 2 のテストが落ちること。内容と結果を PR 本文に書く。

## やってはいけないこと

- LLM を実際に呼ぶこと（テストはモック）。
- 既存記事を作り直すスクリプトを実行・追加すること。

## 完了時

- PR 本文に書くこと:
  - 変更したファイルの一覧
  - 受け入れ条件 1〜6 のそれぞれについて、確認の方法と結果
  - 「壊して落ちた」確認の内容
- ブランチは main から新しく切る。共有の作業ツリーにある未コミットの差分を巻き込まない。`git stash -u` は使わない。
- PR の作成まで。マージはしない。
