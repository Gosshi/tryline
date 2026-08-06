# サポートページ

## 背景

2026-08-06 の App Store 審査で Guideline 1.5 - Safety によりリジェクトされた。

> The Support URL provided in App Store Connect, https://www.trylinerugby.com/legal/tokusho, does not direct to a website with information users can use to ask questions and request support.

App Store Connect の Support URL に `/legal/tokusho`（特定商取引法に基づく表記）を指定していた。同ページには連絡先（`support@trylinerugby.com`、3営業日以内に返信）が記載されているが（`app/legal/tokusho/page.tsx:19-20`）、ページの性格は商取引の法定開示であり、ユーザーが質問やサポートを求めるためのページではない。審査の指摘は妥当である。

サポート専用ページを新設し、App Store Connect の Support URL をそちらに差し替える。

## スコープ

対象:
- `/support` ページの新設
- フッターからの導線追加

対象外:
- 問い合わせフォームの実装。メールでの受付を継続する（フォームは CSRF・レート制限・スパム対策が必要になり、審査対応としては過剰）
- チャットサポート・FAQ 検索などの機能
- `app/legal/tokusho/page.tsx`・`app/legal/privacy/page.tsx`・`app/legal/terms/page.tsx` の変更
- 英語版ページ（審査は日本語圏向けアプリとして提出しているため）
- App Store Connect 側の Support URL 変更（Owner の作業）

## データモデル変更

なし。

## API サーフェス

なし。静的な Server Component ページ1枚。

## UI サーフェス

`app/support/page.tsx` を新設する。既存の法務ページ（`app/legal/privacy/page.tsx`）のレイアウトと文字組みを踏襲する。

掲載内容:

1. **問い合わせ方法** — `support@trylinerugby.com` への `mailto:` リンク。返信の目安（3営業日以内）を明記する。既存ページの記載と数字を揃える
2. **よくある質問** — 最低限、次の4項目を扱う
   - ログインできない / パスワードを忘れた
   - Premium の登録方法と解約方法（Web と iOS アプリの両方に触れる）
   - アカウントの削除方法
   - 試合データ・解説の誤りを見つけた場合の報告先
3. **関連リンク** — 利用規約 `/legal/terms`、プライバシーポリシー `/legal/privacy`、特定商取引法に基づく表記 `/legal/tokusho`、料金 `/pricing`

フッター（サイト共通）に `/support` へのリンクを追加する。既存のフッターに法務リンクが並んでいる場合はその並びに加える。

### メタデータ

- `title`: サポート・お問い合わせ | Tryline
- `description`: Tryline の使い方、Premium の登録・解約、アカウント削除、データの誤り報告に関するご案内と問い合わせ先。
- `alternates.canonical`: `${SITE_URL}/support`
- `robots` は既定のまま（noindex にしない）

## LLM 連携

なし。

## 受け入れ条件

1. `/support` が 200 で表示され、`support@trylinerugby.com` への `mailto:` リンクが存在する。
2. 返信目安（3営業日以内）が明記されており、`app/legal/tokusho/page.tsx` の記載と矛盾しない。
3. よくある質問4項目（ログイン、Premium の登録・解約、アカウント削除、データ誤りの報告）が掲載されている。Premium の解約について **Web と iOS アプリの両方**の手順に触れている。
4. 利用規約・プライバシーポリシー・特商法・料金への内部リンクがあり、いずれも 200 で開ける。
5. サイト共通フッターから `/support` に到達できる。
6. `generateMetadata` で title・description・canonical が設定されている。
7. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean。

## 未解決の質問

1. **Owner の作業が必要。** App Store Connect の Support URL を `https://www.trylinerugby.com/support` に変更しないと再審査で同じ指摘を受ける。

2. **Premium 解約手順の記述は IAP 実装後に確定する。** iOS アプリ内課金の解約は Apple の「サブスクリプション」設定から行うため、`specs/feat-ios-in-app-purchase.md` の実装と整合させる必要がある。先にサポートページを公開する場合は、iOS 側の記述を「App Store のサブスクリプション設定から」という一般的な表現に留めること。
