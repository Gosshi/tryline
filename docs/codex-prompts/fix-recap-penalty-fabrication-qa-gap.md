`/specs/fix-recap-penalty-fabrication-qa-gap.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象は `lib/content/fabrication-guard.ts`（`UNSUPPORTED_STATISTIC_PATTERN` L9-10、`extractStatisticSignals()` L18-41、`STATISTIC_SIGNAL_ALIASES` L43-53）と `lib/llm/prompts/shared-prompt-blocks.ts` の `PROHIBITIONS_BLOCK`（27行目付近、既存の統計禁止句の直後）
- 実際に本番で発生した事例: 日本 vs アイルランド戦（match_id: `d9f72ea3-17da-4eac-b20d-c6bfe0f185b4`）recapを4回再生成中、3回は「アイルランドは反則を犯さないプレーが功を奏した」等の捏造でQAがreject。4回目は同じ捏造を含んだままQAが見逃しpublishされた。`match_team_stats` テーブルはこの試合を含め全DB 0件で、反則数を裏付けるデータはどこにも存在しない

入出力の例:
- 修正前: `containsUnsupportedStatistic("アイルランドは反則なしのクリーンなプレーで勝利した")` は `false` を返す（検出されない）
- 修正後: 同じ入力が `true` を返す。ただし `containsUnsupportedStatistic("アイルランドは反則が少なかった", ["ホームチームのペナルティ5"])` のように裏付けfactがある場合は `false`（許可）

処理すべきエッジケース:
- 「ペナルティゴール」（match_eventsに実在する得点イベント種別、正当な表現）を誤検知しないこと。トリガーキーワードは"反則"のみとし、"ペナルティ"自体はパターンに追加しない（spec「実装詳細」節に理由の記載あり）
- `STATISTIC_SIGNAL_ALIASES` の "反則" エイリアスに "ペナルティ" を含めることで、`buildFactsForSide()`（`lib/llm/stages/qa.ts` L139-141）が生成する「◯◯チームのペナルティ${count}」というfact文字列と正しく照合できるようにする
- 既存の `UNSUPPORTED_STATISTIC_PATTERN` テストケース（成功率・テリトリー%・支配率・回中パターン等）の挙動を壊さないこと

完了の定義:
- specの受け入れ条件1〜5をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean

要件:
- 「スコープ対象外」（`match_team_stats` への実データ投入、QAプロンプト側のLLM判定ロジック変更、「◯回中◯回」パターンの再修正）は実装しない
- 該当6試合recapの再生成は含まない（本番LLM呼び出しのため、コスト承認込みでOwner/Claude Codeが別途実施する）
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
