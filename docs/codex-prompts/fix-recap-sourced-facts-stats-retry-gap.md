`/specs/fix-recap-sourced-facts-stats-retry-gap.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- `lib/llm/sourced-facts/fetch.ts` の `fetchSourcedFactsForMatch()` には、直前のspec（`fix-recap-sourced-facts-zero-result-retry.md`、マージ済み）で「recap検索が0件の場合に1回だけ再試行する」ロジックが既に入っている
- 今回追加するのは別条件: recap検索が**非ゼロ件を返したが、数値スタッツ系の事実が1件も含まれない**場合にも、独立して1回だけ再試行する（合計の再試行が1回を超えないようにする。0件→リトライ→非ゼロだがスタッツ0件、という二重リトライは発生させない）
- 実例: 日本×フランス戦（match_id: `b986f44f-4d3e-4642-a4b9-db8af6324722`）では2件のrecap sourced factsが保存されたが、いずれもコメント・プレー描写のみで、反則数・タックル成功率等の数値スタッツは0件だった。既存の「0件時リトライ」はこのケースを救えない

やること:
- `fetchSourcedFactsForMatch()` 内で、`options.contentType === "recap"` かつ検索結果（`filterAllowedSourcedFacts` 後）が**非ゼロだが数値スタッツ系の事実を含まない**場合、同じプロンプトで `createWebSearchJsonResponse` をもう1回呼ぶ
- 数値スタッツ判定用のヘルパー関数を追加する（例: `containsStatisticalFact(fact: string): boolean`）。判定基準は spec の「スコープ」節を参照（数字+`%`、または `penalt` / `tackle` / `possession` / `territory` / `turnover` / `lineout` / `scrum` 等の統計用語を含むか）
- 既存の「0件時リトライ」ロジックと本条件は**独立した分岐**として扱うが、実装上は1回のリトライ呼び出しに集約してよい（0件の場合は既存ロジックがそのまま発火し、その結果に対して改めて本条件を評価する必要はない。既存ロジックとの合算で1試合あたり最大2回のWeb Search呼び出し（初回+リトライ1回）を超えないこと）
- 2回目も数値スタッツを含まない場合は、そのまま2回目の結果を返す（3回目は呼ばない）

処理すべきエッジケース:
- 1回目が非ゼロ件かつ数値スタッツを含む事実が1件でもあれば、リトライは発生しない
- 1回目が0件の場合は、既存の`fix-recap-sourced-facts-zero-result-retry`のロジックがそのまま動作する（本spec分の追加リトライと合わせて合計2回を超えないこと）
- `contentType === "preview"` の場合は本spec分のリトライが発生しない（既存の挙動を維持）
- リトライで得られた結果は、既存の保存処理（`match_sourced_facts` への upsert）にそのまま乗ること

完了の定義:
- specs の受け入れ条件1〜5を満たす
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` clean
- 変更ファイル一覧を報告する（想定: `lib/llm/sourced-facts/fetch.ts`、関連テスト）

要件:
- 「対象外」（`buildSearchPrompt`の検索意図文言変更、許可ドメインリストの追加、この試合のrecap再生成、previewへの同様のリトライ追加）は実装しない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 数値スタッツ判定に使った具体的なキーワード・正規表現を報告する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
