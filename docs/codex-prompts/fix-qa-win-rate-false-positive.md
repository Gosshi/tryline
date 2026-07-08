`/specs/fix-qa-win-rate-false-positive.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 既存の類似実装パターンは `lib/llm/stages/qa.ts` の `buildFactsForSide`（91-114行目付近、`possession_pct`/`territory_pct` を supportedFacts 文字列に変換している）と `buildTeamStatsFactStrings`（156-167行目）。win_rate も同じ形式で追加する
- `win_rate_last_5` は `lib/llm/stages/assemble.ts` の `key_stats.home/away` に既に存在する（`computeTeamFormStats` で算出）。ナラティブ生成プロンプト（`generate-recap.ts:198`）はこのデータの利用を明示的に指示しているが、QAステージの `matchContext`（`pipeline.ts:213-221`）には配線されていない
- 実際に本番で確認した事例: 南アフリカ vs イングランド戦（match_id: `b5b2af27-4b42-4d58-8ea9-f13d1e2b1466`）で、実データ通りの「イングランドは直近5試合で勝率20%」という正しい記述が、supportedFacts に win_rate が含まれないため `UNSUPPORTED_STATISTIC_ISSUE` で誤ってrejectされ続けた

入出力の例:
- `key_stats.away.win_rate_last_5 = 0.2` のとき、recap本文に「イングランドは直近5試合で勝率20%」とあれば、`containsUnsupportedStatistic` は `false`（未検証統計ではない）を返す
- 同じ状況で本文に「イングランドの成功率は80%」（win_rateともsourced factsとも一致しない数値）とあれば、引き続き `true`（未検証統計）を返す

処理すべきエッジケース:
- `win_rate_last_5` が `null`（直近試合データが無い）の場合、supportedFacts に追加しない（既存の `possession_pct`/`territory_pct` の null チェックと同じパターン）
- パーセント表記のフォーマット揺れ（例: 「20%」vs「20.0%」）で一致判定が壊れないよう、既存の `formatPercent` ヘルパーをそのまま使う
- 既存の `possession_pct`/`territory_pct` ベースの supportedFacts 判定・関連テストを壊さないこと

完了の定義:
- specs の受け入れ条件 1〜5 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- `containsUnsupportedStatistic` に win_rate の supportedFacts を追加した場合と追加しない場合の両方のテストケースを追加する

要件:
- 「スコープ対象外」（UNSUPPORTED_STATISTIC_PATTERN正規表現自体の変更、avg_points系フィールドの扱い、対象試合のrecap再生成）は実装しない
- 未解決の質問（他にも同種の配線漏れが無いか）について、実装時に一通り確認し、見つかった場合は完了報告に明記する（見つかっても本spec内で修正する必要はない。報告のみでよい）
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
