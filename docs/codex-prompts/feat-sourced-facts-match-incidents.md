`/specs/feat-sourced-facts-match-incidents.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象ファイル: `lib/llm/sourced-facts/fetch.ts` の `buildSearchPrompt()`（125-185行目）。recap用の `searchIntent`（136-144行目）にカード・退場等の試合中インシデントのカテゴリを追加する
- 既存テストは `tests/llm/sourced-facts.test.ts`（`buildSearchPrompt` を対象にした既存テストあり）。ここに新カテゴリの検証テストを追加する
- 実例: フィジー vs イングランド戦(2026-07-11)でフィジーのSHシミオネ・クルヴォリが前半終了間際にレッドカードで退場していたが、この事実は現在の検索意図に含まれておらず抽出されなかった。同じ問題が今後の他試合でも起こりうるため、恒久的にプロンプトへ追加する

入出力の例:
- 現在の `searchIntent`（recap向け）は以下の5カテゴリのみ:
  ```
  - official post-match statistics: possession %, territory %, tackle counts, carries, metres gained, lineout/scrum success, turnovers, penalty counts
  - the official Player of the Match / Man of the Match award (only if officially announced; include the awarding body)
  - notable records or milestones set in this match (e.g., career try record, debut)
  - significant injuries sustained during the match
  - brief post-match comments from head coaches or captains (paraphrased, max 15 words per quote)
  ```
- ここに「yellow/red cards, sin-bins, and any resulting suspensions (player name, minute if reported)」のような趣旨のカテゴリを1行追加する。既存カテゴリの文言・順序は変更しない（差分を最小限にする）
- 期待する出力: `buildSearchPrompt(match, "recap")` が返す文字列に、新カテゴリの指示文が含まれる

処理すべきエッジケース:
- preview用の `searchIntent`（145-154行目）は変更しない（spec のスコープ外を明記済み）
- 既存の `contentTypeRules`（数値統計の表記ルール）・confidence判定ルール（"Do not invent, infer, or summarize unsupported claims" 等）はそのまま。新カテゴリにも同じルールが自動的に適用されるため、追加のルール文言は不要と想定されるが、Codex の判断で必要と感じた場合は理由とともに追加してよい
- `SEARCH_PROMPT_VERSION`（16行目、`"sourced-facts@1.2.0"`）はプロンプト内容変更に伴いバージョンを上げるべきか確認すること。既存の他のプロンプトバージョニング慣例（`qa-content.ts` の `PROMPT_VERSION` 等）に倣ってよい

完了の定義:
- specs の受け入れ条件 1〜5 を満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean

要件:
- 「スコープ対象外」（previewのsearchIntent変更、Wikipediaパーサへのカード欄追加、League Oneとの統合、既存recapへの遡及反映）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
