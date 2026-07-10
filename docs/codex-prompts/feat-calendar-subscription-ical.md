`/specs/feat-calendar-subscription-ical.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 試合一覧の取得は `lib/db/queries/matches.ts` の既存クエリを再利用すること
- iCal生成には軽量なnpmパッケージ（例: `ical-generator`）の追加を許容する。追加する場合は `package.json` に追記し、ライセンス上問題ないことを確認する
- `/calendar` ページの現在の実装を読み、購読ボタンの追加箇所を確認すること

入出力の例:
- `GET /api/calendar/all.ics` → 今後の全試合を含む `.ics` ファイル、`Content-Type: text/calendar`
- `GET /api/calendar/nations-championship.ics` → Nations Championshipの試合のみを含む `.ics` ファイル

処理すべきエッジケース:
- 大会slugが存在しない場合は404を返す
- 過去に終了した試合は含めない（今後開催予定の試合のみ）か、直近終了分も含めるかはCodexの判断に委ねる（カレンダーの用途上、将来予定が中心でよい）

完了の定義:
- specs の受け入れ条件 1〜5 をすべて満たす（受け入れ条件6の本番デプロイはOwnerが別途行うため対象外）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 生成した `.ics` ファイルを実際にGoogle CalendarまたはApple Calendarで読み込めることを確認する（確認手順を完了報告に明記する）

要件:
- スコープ対象外（チーム別フィード、リマインダー等のカスタム機能）は実装しない
- 実装方針に迷う場合は完了報告で質問として提示する

完了時:
- 実装内容、変更・新規ファイルを要約する
- iCal検証の確認手順・結果を報告する
- 仕様書からの逸脱があれば理由を明示する
