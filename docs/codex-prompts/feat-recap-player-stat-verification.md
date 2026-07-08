`/specs/feat-recap-player-stat-verification.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- モデルとなる既存パターンは `lib/llm/stages/qa.ts` の `statedWinner` 処理（`applyDeterministicQaGuards` 関数内、`WINNER_MISMATCH_ISSUE` の付与ロジック）。`fix-recap-winner-attribution-consistency.md`（PR #478、実装済み）と全く同じ設計思想（QA応答にフィールド追加→コード側で決定的照合、新規LLM呼び出しなし）で実装する
- 得点計算ヘルパーは `lib/format/match-event-points.ts` の `pointsForMatchEvent` を再利用する（新規実装しない）
- QAステージに渡される試合データの構造は `lib/llm/stages/assemble.ts` の `AssembledContentInput.match_events` を確認する

入出力の例:
- 本文に「マツナガはトライ2本、コンバージョン3本、ペナルティゴール2本で計20点」とあり、実際の `match_events` はトライ1本・コンバージョン3本・PG2本（17点）→ QAが `statedPlayerStats` として `{playerName:"マツナガ",tries:2,conversions:3,penaltyGoals:2,totalPoints:20}` を抽出し、実際値との不一致で issue 発生・`factual_grounding` 減点
- 本文に「バートンはコンバージョン6回中5回成功」とあるが `match_events` に「バートン」が一件も無い → 選手名不一致の issue 発生
- 本文が「〜の活躍が光った」のようにプレースタイル評価のみで具体的な数値を主張していない → `statedPlayerStats` は空配列、チェックはスキップ

処理すべきエッジケース:
- 選手名の表記ゆれ（フルネーム vs 姓のみ、カタカナ表記のゆれ）で実在する選手を誤って「不一致」判定しないよう、既存の人名グラウンディングゲート（`verify-entities.ts`）で使っている名前照合ロジックがあれば参考にする。厳密一致だけだと偽陽性が出うるため、対応方針を完了報告に明記する
- QAステージの応答スキーマ拡張によりJSON応答が壊れないよう、パース失敗時のフォールバック（既存の `statedWinner` パース失敗時の挙動）と同じパターンに揃える

完了の定義:
- specs の受け入れ条件 1〜8 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- QAステージのLLM呼び出し回数が変更前後で同じであることを明記する

要件:
- 「スコープ対象外」（人名グラウンディングゲート自体の変更、sourced_facts対象拡大、新規LLM呼び出し追加）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
