`/specs/fix-qa-team-stats-new-fields-unsupported.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象は `lib/llm/stages/qa.ts` の `buildFactsForSide()`（L90-153）。既存の`possession_pct`・`territory_pct`等のフィールドごとの分岐パターンをそのまま踏襲する
- 実際に本番の試し焼きで発生した事例: `feat-derive-team-stats-from-sourced-facts.md`（PR #554）で`Top14TeamStats`に追加された`lineout_success_pct`・`scrum_success_pct`・`turnovers`・`metres_gained`の4フィールドが、LLMのナラティブ生成プロンプトには見えているのにQAの根拠fact生成（`buildFactsForSide`）には見えておらず、正しくグラウンディングされた記述（「ラインアウトの成功率が高かった」等）が`データに存在しない統計値を含む`で誤ってrejectされた

入出力の例:
- 修正前: `buildTeamStatsFactStrings({ home: { lineout_success_pct: 85 }, away: null })` は `lineout_success_pct` を含む文字列を一切返さない
- 修正後: 戻り値に `"ホームチームのラインアウト成功率85%"` を含む文字列が含まれる

処理すべきエッジケース:
- 4フィールドとも`typeof stats.X === "number"`のガードで既存パターンと同じスタイルにすること（既存コードは`possession_pct`等で同様のnumber型チェックをしている）
- `formatPercent()`ヘルパー（L86-88付近、`Number.isInteger`で整数なら`%`のみ、小数なら`toFixed(1)`）を`lineout_success_pct`・`scrum_success_pct`に再利用すること。`turnovers`・`metres_gained`は`%`ではなくそのまま数値＋単位（回・m相当のラベル）で出力すること
- 既存の`possession_pct`・`territory_pct`・`lineouts_won`/`lineouts_total`等のテスト・出力にリグレッションがないこと

完了の定義:
- specの受け入れ条件1〜4のうち、1〜3（コード実装・テスト・ビルド）を満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean

要件:
- テストは `tests/llm/stages/qa.test.ts` の既存 `describe("buildTeamStatsFactStrings", ...)` ブロック（L189-219、既存テスト「allows official team stat percentages through the statistic guard」の近く）に追加する。既存テストと同じ形式（`buildTeamStatsFactStrings()`の戻り値確認＋`containsUnsupportedStatistic()`でfalseになることの確認）に倣うこと
- 「スコープ対象外」（`deriveTeamStatsFromSourcedFacts()`自体の変更、`buildFactsForSide()`の既存フィールド処理の変更、QA判定プロンプト`qa-content.ts`の変更）は実装しない
- 受け入れ条件4（試し焼き再生成での確認）はOwner/Claude Codeが本番LLMコストを伴って別途実施するため、Codexのスコープには含めない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
