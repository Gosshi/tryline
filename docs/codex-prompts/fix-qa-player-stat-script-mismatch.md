`/specs/fix-qa-player-stat-script-mismatch.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 2026-07-12、Nations Championship Round 2 の recap 2件（日本vsアイルランド、豪州vsフランス）が、本文の統計主張が実際は完全に正しいにもかかわらず選手別統計QAガードで reject された。原因は `lib/stats/player-stats.ts` の `normalizePlayerNameForStatMatch`/`playerNamesLikelyMatch` が、QAが本文（日本語）から抽出するカタカナ選手名（例:「フローリー」）と `match_events.metadata.player_name` のローマ字表記（例: `"Frawley"`）を照合できない構造的バグ。両者は文字体系が異なるため正規化しても一致しない
- 該当2試合は既に本番で手動 `status: published` に修正済み（応急処置）。本タスクはロジック修正のみで、この2試合への追加対応は不要
- 推奨実装方針は spec の「実装方針」節: QAプロンプト（`lib/llm/prompts/qa-content.ts`）に実際の得点者名一覧（英語表記、`match_events` から重複排除）を渡し、`statedPlayerStats[].playerName` にはその一覧の中から対応する英語表記を出力させる。決定的照合ロジック本体（`lib/stats/player-stats.ts`）は変更不要な想定
- 既存の関連実装: `lib/llm/stages/qa.ts`（`applyDeterministicQaGuards` 366-389行目が該当ガード）、`lib/llm/prompts/qa-content.ts`（`playerStatCheckBlock` 81-89行目）、`lib/stats/player-stats.ts`（`buildPlayerStatsFromEvents`/`findActualPlayerStats`）
- 既存テスト: `tests/llm/stages/qa.test.ts` 491-537行目（マツナガ数値不一致、true positive）、539-582行目（バートン架空選手、true positive）、584-626行目（正しい主張は通る、ただし英語名のみでテスト済み＝今回のカタカナケースの穴）。`tests/llm/prompts/qa-content.test.ts` にプロンプト内容のテストパターンあり

入出力の例:
- 入力: match_events に `{ type: "conversion", minute: 9, metadata: { player_name: "Frawley" } }` 等3件（9分・34分・50分）を含む試合。recap本文が「フローリーはコンバージョンを3本成功させ」と記述
- 期待する出力: QAのLLM呼び出しが `statedPlayerStats: [{ playerName: "Frawley", conversions: 3 }]`（カタカナではなく実際の得点者一覧から選んだ英語表記）を返すようプロンプトが誘導し、`lib/stats/player-stats.ts` の既存照合が正しく一致と判定、`PLAYER_STAT_MISMATCH_ISSUE` が発生しない
- テストではLLM呼び出し自体をモックするため、「プロンプトに実際の得点者一覧が含まれているか」と「モックが英語名を返した場合に正しく一致判定されるか」の2段階で検証すること（既存テストのモックパターンに倣う）

処理すべきエッジケース:
- 得点者一覧が空（`hasEvents: false` や events はあるが誰も得点していない等）の場合、`playerStatCheckBlock` は現状通り機能すること
- 同姓が複数選手にまたがる場合（今回のデータでは未確認だが、一覧内に重複表記が生じるケース）にLLMが誤って別人と紐付けるリスクがある。プロンプト側で「一覧のどの選手にも確信を持って対応づけられない場合はその主張を含めない」旨を明記し、無理な紐付けよりも「主張なし扱い」を優先させること
- 既存のtrue-positiveテスト（バートン架空選手、マツナガ数値不一致）が新しいプロンプト設計のもとでも引き続き機能することを確認する。特にバートンのテストは「一覧に存在しない選手名を主張した」ケースとして自然に成立するはずだが、モックの `statedPlayerStats` に含める `playerName` の値（英語かカタカナか）によって挙動が変わらないか確認すること

完了の定義:
- specs の受け入れ条件 1〜6 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 完了報告に、プロンプト拡張によるトークン数の概算増分（1試合あたり）を記載する

要件:
- 「スコープ対象外」（音写変換ライブラリ導入、entity grounding gate の変更、既存recapの一括再生成、players テーブルへの日本語名カラム追加）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない
- spec の「実装方針」は推奨であり必須ではない。より保守性の高い代替案がある場合は理由とともに完了報告に明記してよい

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
