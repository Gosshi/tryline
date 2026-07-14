`/specs/feat-calendar-og-image.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む（Codex 向けの規約ファイル。`CLAUDE.md` は Claude Code 向けなので参照しない）
- 過去の判断は `/docs/decisions.md` を読む
- 既存の動的OG画像生成基盤は `app/api/og/route.tsx`（`@vercel/og` の `ImageResponse`、`type=result`/`type=competition`/`type=round-scoreboard` 分岐が既存）。フォント取得ロジック（`interFont`/`fontData`/`fontName`/`bgDataUri`）はファイル冒頭（1-130行目付近）で共通化されているので重複取得しない
- レイアウトのベースは `type=competition` 分岐（132-243行目、中央寄せカード・グラデーション背景・右上 `TRYLINE` バッジ・下部 `trylinerugby.com`）を流用する。`type=round-scoreboard`（245行目〜）のような試合一覧の列挙レイアウトは使わない
- 呼び出しヘルパのパターンは `lib/seo/og-image.ts` の既存 `createCompetitionOgImage` を参照する
- カレンダーページのデータ取得は `app/calendar/page.tsx` の `getMatchesInRange`（`lib/db/queries/matches.ts`）・週レンジ計算（`getJstWeekRangeUtc`/`getCurrentJstWeekRangeUtc`/`formatJstWeekRangeLabel`, `lib/format/week.ts`）・注目試合選定（`selectCalendarFocusMatchId`, `lib/format/calendar-focus.ts`）・大会別順位ルックアップ（`getStandingPositionLookupForCompetitions`）を、ページ本体と同じ手順で `generateMetadata` 内でも呼び出す（`app/matches/[id]/page.tsx` の `generateMetadata` が `getMatchById` を独自に呼ぶ既存パターンと同様、重複フェッチは許容する）

入出力の例:
- `GET /api/og?type=calendar&week_label=7月14日%20-%2020日%20JST&match_count=12&competition_count=5&focus_home=Japan&focus_away=France&focus_competition=Nations%20Championship` → 1200x630 画像。見出しに「今週の海外ラグビー」＋週レンジ、サブラインに「5大会 12試合」、下部に小さめの補足行「注目: Japan vs France（Nations Championship）」
- `GET /api/og?type=calendar&week_label=7月28日%20-%208月3日%20JST&match_count=0&competition_count=0` → 注目試合の行を出さず、試合数0でもエラーにならない画像
- `type=result`/`type=competition`/`type=round-scoreboard` へのリクエストは従来通り（本 spec で変更しない）

処理すべきエッジケース:
- `focus_home`/`focus_away` が両方揃っていない場合（片方だけ、または両方なし）は注目試合の行を描画しない
- チーム名・大会名が長い場合は既存の `truncate` 関数で省略する
- **視覚的な優先順位を必ず守る**: 見出し（「◯大会◯試合」）の文字サイズ・重みは、注目試合の補足行より大きく/太くする。補足行が見出しより目立ってはならない（spec の「設計判断」節を参照）
- `/calendar?week=<過去/未来の週>` でアクセスした場合も、その週の実際の試合数・大会数を反映する

完了の定義:
- specs の受け入れ条件 1〜9 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 3パターン（通常の週・試合0件の週・注目試合ありの週）のOG画像を実際に生成し、スクリーンショットを提示する

要件:
- 「スコープ対象外」（全試合列挙レイアウト、カレンダー以外のページのOG画像、`week` 以外の `/calendar` の挙動変更、`match_events` 由来の統計表示）は実装しない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して Owner に確認する（実装し終えてから末尾で質問しない）
- 受け入れ条件に対するテストを書く（`tests/` 配下の既存構成に倣う）

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
