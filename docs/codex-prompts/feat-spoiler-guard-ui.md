`/specs/feat-spoiler-guard-ui.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- `components/notification-settings.tsx` の現在の実装（Push購読の設定UI）を読み、既存の購読トグルと同じパターンでスピーラーガードトグルを追加すること
- `app/api/push/subscribe/route.ts` は既に `spoiler_guard` パラメータを受け付けている（変更不要、そのまま使う）
- スコア表示箇所: `components/home-matchday-board.tsx`（想定、実際のファイル名は `grep -rn "HomeMatchdayBoard" app/page.tsx` 等で確認）、`/calendar` ページの試合カードコンポーネント、`app/matches/[id]/page.tsx` のスコアヘッダー部分

入出力の例:
- ネタバレ防止モードON設定 → `push_subscriptions.spoiler_guard = true` に保存される
- ネタバレ防止モードONのユーザーがホームを開く → スコアの代わりに「タップして結果を見る」等のプレースホルダーが表示され、タップで実スコアに切り替わる

処理すべきエッジケース:
- Push購読していない（通知未許可の）ユーザーへのネタバレ防止モード提供方法に迷う場合、spec の「未解決の質問」を参照し、完了報告で質問として提示してよい
- 試合が未終了（キックオフ前・進行中）の場合はそもそも隠すべきスコアが無いので、通常表示のままでよい

完了の定義:
- specs の受け入れ条件 1〜5 をすべて満たす（受け入れ条件6の本番デプロイはOwnerが別途行うため対象外）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean

要件:
- スコープ対象外（タイマーでの自動開示、非ログインユーザーへの提供）は実装しない
- 実装方針に迷う場合は完了報告で質問として提示する

完了時:
- 実装内容、変更・新規ファイルを要約する
- ログイン中ユーザーの spoiler_guard 設定値をどう画面側で参照する設計にしたか説明する
- 仕様書からの逸脱があれば理由を明示する
