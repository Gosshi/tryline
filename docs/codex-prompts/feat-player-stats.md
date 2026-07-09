`/specs/feat-player-stats.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 選手別スタッツ集計ロジックは `lib/llm/stages/qa.ts` に既に実装済み（`buildPlayerStatsFromEvents`・`normalizePlayerNameForStatMatch`・`playerNamesLikelyMatch`・`ActualPlayerStats`型、288行目付近）。これらは現状 `qa.ts` 内のプライベート関数のため、共有モジュール（例: `lib/stats/player-stats.ts`）に抽出し、QAゲート（既存の呼び出し元）と選手ページ（新規）の両方から使えるようにしてください。ロジックを複製しないこと
- 選手ページは `app/players/[slug]/page.tsx`。既存の `getPlayerBySlug`・`getMatchesForPlayer`（`lib/db/queries/players.ts`）のパターンに倣い、新しいデータ取得関数を追加する
- `PLAYER_PAGES_INDEXABLE` フラグは `lib/db/queries/players.ts` の `isIndexablePlayer()` 内にある（`fix-player-pages-noindex-until-stats.md` で `false` に設定済み）
- **重要な既存の教訓**: `match_events.player_id` は NULL でも「得点者不明」ではない。得点者名の正は常に `match_events.metadata->>'player_name'`。集計ロジックは必ずこちらを使うこと（`buildPlayerStatsFromEvents` は既にこの原則に従っている）

入出力の例:
- ある選手の通算スタッツ取得関数に選手IDを渡すと、`{ appearances, tries, conversions, penaltyGoals, points }` 相当の集計結果が返る
- `match_events` に一致する記録が無い選手の場合、0件または該当なしを示す値が返り、エラーにならない

処理すべきエッジケース:
- `canonical_player_id` による同一選手の名寄せ（複数チーム・複数シーズンにまたがる選手）がスタッツ集計にも正しく反映されること
- 選手名の表記ゆれ（フルネーム vs 姓のみ等）は `normalizePlayerNameForStatMatch`/`playerNamesLikelyMatch` の既存ロジックをそのまま使う

完了の定義:
- specs の受け入れ条件 1〜6 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 抽出した共有ロジックの既存呼び出し元（QAゲート）のテストが壊れていないことを確認する
- 選手ページのスタッツ表示に対するテストを追加する

要件:
- スコープ対象外（生年月日・ポジション・caps補完、得点以外のイベント種別表示、選手ページ全体のデザイン刷新）は実装しない
- `PLAYER_PAGES_INDEXABLE` を `true` に戻すかどうかは、実装完了後にOwnerに確認してから行う（完了報告で確認を求める形でよい。勝手にtrueにして良いか、それとも実装だけ済ませてフラグはfalseのまま完了報告するか、迷う場合は後者を選び質問として提示する）
- 未解決の質問（フラグ切り替えタイミング、canonical_player_id統合）は完了報告で質問として提示してよい

完了時:
- 実装内容、抽出した共有モジュール、変更ファイルを要約する
- 実際にスタッツが表示される選手の例（match_idやスタッツ内容）を完了報告に含める
- 仕様書からの逸脱があれば理由を明示する
