# Codex 指示書: Web 検索で事実を集める処理の費用を下げる

仕様書: `specs/fix-sourced-facts-web-search-cost.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## やること（すべて `lib/llm/sourced-facts/fetch.ts` の `fetchSourcedFactsForMatch` の中）

1. プレビューで、その試合に `model_version = "manual"` の事実が 1 件以上あれば、`force` の有無に関係なく Web 検索をしない。`pipeline_runs` に `stage = 5`・`skipped_reason = "manual_facts_present"`・`cost_usd = 0` を記録する。
2. レビューの 2 回目の検索（`searchSourcedFacts()` をもう一度呼ぶ処理）を削除する。
3. Web 検索を 1 回するたびに `pipeline_runs` に `stage = 5` の行を記録する（仕様書の「データモデル変更」の形）。キャッシュの判定に「今の版の `stage = 5`・`success` の記録があれば、その時刻を `fetchedAt` として `shouldUseCachedFacts` に渡す」を足す。

## 触るファイル

- `lib/llm/sourced-facts/fetch.ts`
- テスト（既存の `fetchSourcedFactsForMatch` のテストの配置に合わせる）

## 守ること

- 検索のモデル（`MODELS.WEB_SEARCH`）、プロンプト（`SEARCH_PROMPT_VERSION`）、事実の選び方、保存の仕方は変えない。
- レビューには、手で入れた事実による判定を使わない。
- 検索が例外を投げたときは、`status = "failed"` で記録したうえで、今までどおり例外を呼び出し元に伝える（握りつぶさない）。
- `pipeline_runs` への記録が失敗しても、事実の取得と保存は続ける（記録の失敗はログに出すだけ）。
- `cost_usd` は、検索の応答の `usage` から既存の `calculateCostUsd` で計算する。検索ツールの呼び出し料金は含めない。

## 処理すべきエッジケース

1. 手で入れた事実があり、自動の事実も保存済みのプレビュー: 検索せず、両方を返す（今のキャッシュを使った場合と同じ）。
2. `stage = 5` の記録の `output.prompt_version` が今の版と違う: 記録が無いものとして扱い、検索する。
3. `stage = 5` の記録が `failed` だけ: 記録が無いものとして扱い、検索する。
4. `scripts/trial-content-models.ts` の `getRecentAverageArticleCost` は、`stage = 1` を 1 回の生成の始まりとして、後に続く行の費用を足している。`stage = 5` の行は `stage = 1` より前に記録されるので、**前の生成の費用に数えられてしまう**。この関数で `stage = 5` の行を除くか、対応する生成に正しく数えるかを決めて、PR 本文に書く（仕様書には書いていない細部なので、どちらでもよい。ただし何もしないのは不可）。

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行する（**3 つとも必ず実行し、結果を完了報告に含める**）。
- 「壊して落ちる」確認（コミットしない）。それぞれの内容と結果を PR 本文に書く。
  - 手で入れた事実による判定を外すと、受け入れ条件 1 のテストが落ちる。
  - レビューの 2 回目の検索を戻すと、受け入れ条件 3 のテストが落ちる。

## やってはいけないこと

- LLM を実際に呼ぶこと（テストはモック）。
- 本番 DB に書き込むこと。

## 完了時

- PR 本文に書くこと:
  - 変更したファイルの一覧
  - 受け入れ条件 1〜6 のそれぞれについて、確認の方法と結果
  - 「壊して落ちた」確認の内容
  - エッジケース 4 をどう扱ったか
- ブランチは main から新しく切る。共有の作業ツリーにある未コミットの差分を巻き込まない。`git stash -u` は使わない。
- PR の作成まで。マージはしない。
