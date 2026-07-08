`/specs/feat-calendar-week-navigation.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 基準ビジュアルは `docs/design/mock-growth-home-calendar.html` の `.week-tabs`（週タブ）、`.action-pill`（状態ピル）、`.calendar-row.highlight`（注目行）を参照する。ただし全体のレイアウトは現行の日付縦ブロック方式（PR #490）を維持し、モックの行レイアウトへの置き換えはしない
- `components/calendar/week-schedule.tsx` は共有コンポーネントで、`app/page.tsx`（ホーム「今週の試合」、`compact`）と `app/calendar/page.tsx`（`/calendar`、非 `compact`）の両方から使われている
- 注目試合のレベルスコア計算は PR #497（`codex/feat-home-multi-competition-featured-reviews`）で実装済みのロジックを共有ユーティリティに切り出して使う。複製しない
- 週範囲計算の既存パターンは `lib/format/week.ts` の `getCurrentJstWeekRangeUtc`、DB クエリは `lib/db/queries/matches.ts` の `getMatchesInRange`

入出力の例:
- `/calendar` → 今週（JST 月曜 00:00〜翌月曜 00:00）。canonical `/calendar`、index 可
- `/calendar?week=2026-07-13` → 7/13(月) 起点の週。`noindex, follow`、canonical は `/calendar` のまま
- `/calendar?week=2026-07-15`（水曜）や `?week=abc` や `?week=2027-01-04`（8週超）→ 今週表示にフォールバックして 200
- 試合の状態ピル: preview のみ published →「プレビュー」、recap published →「レビュー」、両方 →「レビュー」のみ、どちらも無し → ピルなし

処理すべきエッジケース:
- `CalendarMatch.hasContent` の削除に伴う参照箇所の洗い出し（`week-schedule.tsx` 以外に使用箇所がないか grep で確認し、あれば `hasPreview || hasRecap` に置換）
- 日本代表戦が週に複数ある場合は最初のキックオフを注目試合にする
- world_ranking / standings がどちらも無い週はハイライトなしで正常表示（エラー・空ハイライトの残骸を出さない）
- 試合が 0 件の週（前週・翌週に移動した場合に起こりうる）で空状態メッセージが正しく出ること
- 過去週の試合行はスコア表示になる（既存 `getMatchStateLabel` の挙動を壊さない）

完了の定義:
- specs の受け入れ条件 1〜9 をすべて満たす
- `tests/app/calendar-page.test.tsx` / `tests/db-queries-matches-calendar.test.ts` を更新し `pnpm test` が通る
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- `/calendar`（今週・前週・翌週）とホームの「今週の試合」帯のスクリーンショットを提示する

要件:
- 「スコープ対象外」（ホーム変更・メール登録・チャット/H2H ピル・日付ブロックのデザイン変更・大会フィルタ）は実装しない
- クエリ回数を増やさない（published コンテンツ取得は既存クエリの select に `content_type` を足して仕分ける）
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
