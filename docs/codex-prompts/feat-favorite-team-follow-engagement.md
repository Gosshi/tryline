`/specs/feat-favorite-team-follow-engagement.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 既存の応援チーム機能: `components/favorite-teams-banner.tsx`・`components/team-picker.tsx`・`components/user-menu.tsx`・`app/api/user/profile/route.ts` を読んで現状の実装を理解すること
- 既存のGA4計測パターン: `lib/analytics.ts` の `trackEvent`/`trackCtaClick` と `components/tracked-link.tsx` を参考にすること。新しいイベント関数もこの `trackEvent` をラップする形で追加する
- Push購読の許可検知は `components/notification-settings.tsx` 周辺のブラウザ通知許可フローを参照すること

入出力の例:
- ユーザーが「このチームを追う」ボタンをクリック → 応援チーム登録完了 → `trackEvent("favorite_team_added", { team_slug: "japan" })` 相当が発火
- ユーザーがブラウザの通知許可ダイアログでOKを押す → `trackEvent("push_permission_granted")` が発火

処理すべきエッジケース:
- 既に応援チーム登録済みのユーザーには、これ以上登録を促すバナー・CTAを過剰に出さない（既存の `sessionStorage` によるdismiss機構等、ユーザー体験を悪化させない工夫を維持・応用する）
- `return_visit` の判定ロジックに迷う場合は完了報告で質問として提示してよい

完了の定義:
- specs の受け入れ条件 1〜5 をすべて満たす（受け入れ条件6の本番デプロイはOwnerが別途行うため対象外）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean

要件:
- スコープ対象外（専用オンボーディングページの新設、レコメンドアルゴリズムの開発）は実装しない
- 実装方針に迷う場合は完了報告で質問として提示する

完了時:
- 実装内容、変更・新規ファイルを要約する
- return_visit イベントの判定ロジックを説明する
- 仕様書からの逸脱があれば理由を明示する
