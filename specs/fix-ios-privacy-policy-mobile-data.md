# iOSアプリのデータ収集をプライバシーポリシーに反映

## 背景

2026-07-25の外部GPTによるiOSリリース可否監査で指摘（[[project_ios_release_readiness_gaps]]項目1）。現行の `/legal/privacy` はメール・Stripe決済情報・GA4アクセスログへの言及のみで、iOSアプリ（tryline-mobile）が実際に収集する以下のデータへの言及がない。App Store審査ガイドライン5.1.1（データ収集の開示）に抵触するリスクがあるため、公開前に必須で直す。

実データ収集箇所をコード確認済み（`tryline-mobile/src/settings/SettingsProvider.tsx`, `src/notifications/registration.ts`）:
- Expo Push Token（`getExpoPushTokenAsync`で取得、`syncPushRegistration`でサーバーへ送信・`expo_push_tokens`テーブルに保存）
- お気に入りチームのslug（`user_profiles.favorite_team_slugs`に保存）
- 通知設定（試合前通知・コンテンツ公開通知のON/OFF、`syncPushRegistration`でサーバー送信）
- ネタバレ防止設定（spoilerGuard、同じく`syncPushRegistration`でサーバー送信）

## スコープ

対象:
- `app/legal/privacy/page.tsx` の以下3セクションを更新する
  1. 「収集する情報」に新規項目「モバイルアプリの利用情報」を追加
  2. 「情報の利用目的」に「プッシュ通知の配信」「ユーザー設定（お気に入りチーム・通知設定）の同期」を追加
  3. 「第三者への情報提供」の表に Expo (Expo Technologies, Inc.) の行を追加（提供する情報: Push Token、目的: プッシュ通知配信基盤）
  4. ページ末尾の「最終更新日」を更新日に変更

対象外:
- App Store Connect側の「App Privacy」（プライバシー栄養ラベル）の実際の入力作業（Owner自身がApp Store Connect管理画面で行う。文言案は`docs/ios-app-store-submission.md`参照）
- Web側の新規データ収集の追加（今回はモバイル既存データの開示追加のみ）

## データモデル変更 / API サーフェス

なし（既存の収集実態をポリシー文言に反映するのみ）。

## UI サーフェス

`app/legal/privacy/page.tsx` に以下のJSXを追加する。既存の `<ul>` パターン（36-58行目）・`thirdPartyServices` 配列（7-11行目）の書式を踏襲する。

追加する「収集する情報」の項目文言（既存`<ul>`内に追加）:

```
モバイルアプリの利用情報:
iOSアプリ利用時、プッシュ通知配信のためのPush Token、お気に入りチームの選択、通知設定（試合前通知・コンテンツ公開通知）、ネタバレ防止設定を収集します
```

追加する「情報の利用目的」の項目（既存`<ul>`内に追加、67-70行目の並びに揃える）:

```
プッシュ通知の配信
ユーザー設定（お気に入りチーム・通知設定・ネタバレ防止設定）の同期
```

追加する`thirdPartyServices`配列の行:

```ts
["Expo Technologies, Inc.", "Push Token", "プッシュ通知配信基盤"],
```

## 受け入れ条件

1. `/legal/privacy` に上記4点の変更が反映されている
2. 既存の文言・構造（メール・Stripe・GA4の記載）は変更しない
3. `pnpm test` / `pnpm lint` / `pnpm tsc --noEmit` が通る（静的テキストのみの変更でテスト追加は不要）
4. 変更後、Owner が目視でページ表示を確認する

## 未解決の質問

なし。文言はOwner確認の上でこのspec内に確定済み。
