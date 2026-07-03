`/specs/fix-preview-section-headings.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象ファイルは `lib/llm/prompts/generate-preview.ts` のみ
- 同種の修正の前例が `lib/llm/prompts/generate-recap.ts`（`recap@4.2.0` → `4.3.0`、対応 spec: `specs/fix-recap-heading-format.md`）にあるので、diff の粒度・書き方のトーンを揃えること
- `PROMPT_VERSION` は `preview@3.5.0` → `preview@3.6.0` に上げる

入出力の例:
- 変更前（悪い出力）: 見出しが `## セクション1: 両チームの現状` のようにラベル付きで出力される
- 変更後（良い出力）: 見出しが `## 両チームの現状` のように内容のみになる（「セクション1」「セクション2」等のラベルは一切出力されない）

処理すべきエッジケース:
- `hasLineups` / `isDataSparse` / 通常（events あり・lineups なし）の3ケースすべてで `structureInstruction` を書き換えること。3ケースのどれか1つだけ直して終わらない
- `buildCoreQuestionBlock`（58-90行目、「セクション0」を生成する箇所）は変更しないこと。実害がないため対象外
- 見出し名の「自由記述」という既存の指示意図（「両チーム現状」に固定しないこと）は維持したまま、ラベル露出だけを止めること。見出し内容の自由度を落とさないこと

完了の定義:
- `lib/llm/prompts/generate-preview.ts` の3ケースの `structureInstruction` が spec 記載のパターンに沿って書き換わっている
- `PROMPT_VERSION` が `preview@3.6.0` になっている
- 3ケースそれぞれで少なくとも1件、実際にプレビューを試し焼きし、見出しに「セクションN」「Section N」等のラベルが出力されないことを確認する（既存の生成スクリプト・テストランナーがあればそれを使う。無ければ Owner に確認して試し焼き手段を確認すること。一括再生成は行わない）
- `pnpm tsc --noEmit` が通る

要件:
- 受け入れ条件セクションのすべてを実装する
- 「スコープ対象外」にある項目（`generate-recap.ts`、表示コンポーネント、既存コンテンツの再生成）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
