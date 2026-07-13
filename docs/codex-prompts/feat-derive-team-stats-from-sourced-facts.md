`/specs/feat-derive-team-stats-from-sourced-facts.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象は `lib/llm/stages/assemble.ts`（`loadTeamStats()` L518-565、統合ポイントは`Promise.all`直後のL781-800付近、最終`AssembledContentInput`組み立てはL945-946付近）、`lib/llm/types.ts`の`Top14TeamStats`型（L107-121）、新規ファイル（例: `lib/llm/sourced-facts/derive-team-stats.ts`）
- 実際に本番で発生した事例: 日本 vs アイルランド戦のrecap再生成で、`match_sourced_facts`にポゼッション・タックル数等8件の実データがあったのに本文に一切反映されなかった。原因は`teamStatsBlock`（強い「積極的に使うこと」指示）と`sourcedFactsBlock`（弱い「使ってよい」指示＋同一ソース複数引用禁止）の扱いの差で、`team_stats`経路は`competitionFamily === "top-14"`の試合にしか使われない設計だった

入出力の例:
- 入力fact例（実際のsourced_facts、日本 vs アイルランド戦）:
  ```
  "Possession: Japan 48% - Ireland 52%"
  "Territory: Japan 45% - Ireland 55%"
  "Tackle counts: Japan 120 - Ireland 110"
  "Lineout success: Japan 85% - Ireland 90%"
  ```
- 期待する出力（ホームチームが日本の場合）: `{ home: { possession_pct: 48, territory_pct: 45, tackles_made: 120, lineout_success_pct: 85 }, away: { possession_pct: 52, territory_pct: 55, tackles_made: 110, lineout_success_pct: 90 } }`
- これらのfactは解析成功後、最終的に`assembled.sourced_facts`配列からは除外される（プロンプトへの二重掲載を避けるため）

処理すべきエッジケース:
- spec「実装方針」に列挙したスタッツ名→フィールド名のマッピング表に無い名称のfactは無視し、`sourced_facts`側にそのまま残す
- チーム名がhome/awayどちらにもマッチしない、または両方にマッチしてしまう曖昧なfactは解析をスキップし、`sourced_facts`側に残す（安全側に倒す）
- `competitionFamily === "top-14"`で`match_team_stats`にデータがある場合は、そちらを優先し、sourced_facts解析は行わない（既存動作を壊さない）
- パース対象の正規表現はspecに記載した例をベースに、実際のfact文字列の表記ゆれ（スペースの数、`-`と`–`の混在等）を吸収できるようCodex実装時に調整すること

完了の定義:
- specの受け入れ条件1〜4のうち、1〜3（コード実装・テスト・ビルド）を満たす。受け入れ条件4（実際の試し焼き再生成による目視確認）はOwner/Claude Codeが本番LLMコストを伴って別途実施するため、Codexのスコープには含めない
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean

要件:
- 「スコープ対象外」（`Top14TeamStats`のリネーム、`match_team_stats`テーブルへの書き込み、Top14スクレイパの変更、sourced_facts検索プロンプト・QAプロンプトの変更）は実装しない
- テストは新規ファイル `tests/llm/sourced-facts/derive-team-stats.test.ts`（パース関数の単体テスト）と、既存 `tests/llm/stages/assemble.test.ts`（統合テスト。現状team_stats関連のテストが無いため新規追加）に書く
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
