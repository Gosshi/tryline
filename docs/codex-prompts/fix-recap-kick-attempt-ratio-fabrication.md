`/specs/fix-recap-kick-attempt-ratio-fabrication.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象は `lib/llm/prompts/shared-prompt-blocks.ts` の `PROHIBITIONS_BLOCK`（27行目付近、既存の統計禁止句の直後）と `lib/content/fabrication-guard.ts` の `UNSUPPORTED_STATISTIC_PATTERN`（9行目）
- 実際に本番で2回連続reject された事例: 南アフリカ vs イングランド戦（match_id: `b5b2af27-4b42-4d58-8ea9-f13d1e2b1466`）recapで「コルベはコンバージョンを7回中5回成功」という表現が繰り返し生成された。`match_events` には成功した5回のコンバージョンのみが記録されており「7回中」という分母の根拠がない

入出力の例:
- 修正前: 「7回中5回成功」「打率にして5/7」等の分母付き成功率表現がプロンプトで禁止されておらず、生成される可能性がある
- 修正後: `PROHIBITIONS_BLOCK` に禁止句が追加され、`UNSUPPORTED_STATISTIC_PATTERN.test("彼は7回中5回成功させ")` が `true` を返す

処理すべきエッジケース:
- `UNSUPPORTED_STATISTIC_PATTERN` の正規表現変更が既存のテストケース（成功率・テリトリー%・支配率等の既存パターン）を壊さないことを確認する
- 「◯回中◯回」の数字部分は可変（1〜2桁想定）。正規表現は `\d+回中\d+回` で十分だが、実装時に既存パターンとの優先順位・オーバーラップを確認する

完了の定義:
- specs の受け入れ条件 1〜5 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean

要件:
- 「スコープ対象外」（PR #509のロジック変更、match_eventsへの試投失敗イベント追加、対象試合のrecap再生成）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
