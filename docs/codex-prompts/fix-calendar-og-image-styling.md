`/specs/fix-calendar-og-image-styling.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む（Codex 向けの規約ファイル。`CLAUDE.md` は Claude Code 向けなので参照しない）
- 過去の判断は `/docs/decisions.md` を読む（D012 の2026-07-14追記に本修正の経緯がある）
- 本修正の対象は `specs/feat-calendar-og-image.md`（実装済み・PR #568でマージ済み）の一部。`feat-` 側は変更しない
- `app/api/og/route.tsx` の `type=calendar` 分岐（255行目付近）を編集する。フォント取得ロジック（ファイル冒頭）は変更不要
- キックオフ時刻のフォーマットは `lib/format/kickoff.ts` の既存関数（`formatKickoffJstDate`/`formatKickoffJstTime`）を使う。新規フォーマット関数が必要なら同ファイルに追加し、`route.tsx` にロジックを直書きしない
- `lib/seo/og-image.ts` の `createCalendarOgImage`（64行目付近）にパラメータを追加する
- `app/calendar/page.tsx` の `generateMetadata` 内、`createCalendarOgImage` 呼び出し箇所（91行目付近）で注目試合（`selectCalendarFocusMatchId` で選ばれた試合）の `kickoffAt` を渡す

入出力の例:
- `GET /api/og?type=calendar&week_label=7月14日%20-%2020日%20JST&match_count=6&competition_count=1&focus_home=日本&focus_away=フランス&focus_competition=ネーションズチャンピオンシップ%202026&focus_kickoff=2026-07-18T08:40:00.000Z` → 注目試合の行に日本時間のキックオフ日時（例: `7/18 (土) 17:40 JST`）が追加表示される。「1大会 6試合」の文字色が `#c93a40`（緑ではない）
- `focus_kickoff` を省略した場合 → 現行と同じ「注目: 日本 vs フランス（ネーションズチャンピオンシップ 2026）」の表示（キックオフ時刻なし）。エラーにならない
- `focus_kickoff=invalid-date` のような不正な値の場合 → キックオフ時刻表示を省略し、エラーにならない

処理すべきエッジケース:
- `focus_home`/`focus_away` が両方揃っていない場合（既存仕様通り）は注目試合の行自体を表示しない。この場合 `focus_kickoff` があっても無視する
- `focus_kickoff` の日付パースに失敗する場合はキックオフ時刻を表示せず、他の表示（チーム名・大会名）は通常通り出す
- `type=result`/`type=competition`/`type=round-scoreboard` の色（`#22c55e` 系、591/612/640/805/900/980行目付近）は一切変更しない。変更するのは `type=calendar` 分岐内の「◯大会◯試合」の文字色のみ

完了の定義:
- specs の受け入れ条件 1〜7 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 既存テスト（`tests/lib/seo/og-image.test.ts` / `tests/api/og-competition.test.tsx` / `tests/app/calendar-page.test.tsx`）をキックオフ時刻ありなしの両パターンに対応させて更新する
- キックオフ時刻ありの通常パターン・キックオフ時刻なし（注目試合自体がない週）の2パターンのOG画像を実際に生成し、スクリーンショットを提示する

要件:
- 「スコープ対象外」（レイアウト全体の再設計、背景装飾の追加、`type=result`/`type=competition`/`type=round-scoreboard` の色変更）は実装しない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して Owner に確認する（実装し終えてから末尾で質問しない）
- 受け入れ条件に対するテストを書く（`tests/` 配下の既存構成に倣う）

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
