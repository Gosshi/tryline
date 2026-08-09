# iOS App Store 提出チェックリスト（Owner対応項目）

**2026-08-02: App Store審査へ提出完了。** 提出直前に「価格」未設定・「コンテンツ配信権」未回答の2件がブロッカーとして表示されたため、価格を全地域$0.00（無料）に設定、コンテンツ配信権は「いいえ、サードパーティのコンテンツを含まない」で回答して解消。以降のTODOは審査結果待ちと、承認後のデモログイン用env var後始末（§2末尾・§3手順7）のみ。

[[project_ios_release_readiness_gaps]] の6項目のうち、コードでは解決できずOwner自身の対応が必要な項目をまとめる。項目1（プライバシーポリシー本文の更新）は `specs/fix-ios-privacy-policy-mobile-data.md` としてCodexに委譲済みで、ここでは残り5項目を扱う。

## 1. App Store Connect「App Privacy」（プライバシー栄養ラベル）入力案

App Store Connect > アプリ > App Privacy で以下を選択する。実データ収集箇所はコード確認済み（`tryline-mobile/src/settings/SettingsProvider.tsx`, `src/notifications/registration.ts`, Supabase Auth）。

| データ種別 | 収集する項目 | 用途 | ユーザーに紐付くか |
|---|---|---|---|
| Contact Info > Email Address | メールアドレス（Supabase Auth） | App Functionality（ログイン） | Linked to user |
| Identifiers > User ID | Supabase user id | App Functionality | Linked to user |
| Identifiers > Device ID | Expo Push Token | App Functionality（プッシュ通知配信） | Linked to user |
| Usage Data > Product Interaction | お気に入りチーム・通知設定・ネタバレ防止設定 | App Functionality | Linked to user |
| Purchases > Purchase History | なし（IAP未実装、Web側Stripe決済のみ） | — | — |
| Diagnostics | なし（クラッシュレポート/診断SDK未導入を確認済み、`package.json`にSentry等の記載なし） | — | — |

いずれも「Data Used to Track You」（トラッキング）には該当しない想定（第三者への広告目的の共有なし）。トラッキングに該当しないことを前提にATT(App Tracking Transparency)ダイアログは不要。

## 2. Review Notes 文案（App Review担当者向け）

App Store Connect > アプリ > バージョン情報 > App Review Information > Notes に貼り付ける文案:

```
このアプリはReader Appモデルです。アプリ内に価格表示や購入導線はなく、
既存のWeb（https://www.trylinerugby.com）でStripe経由でご契約いただいた
ユーザーがログインしてPremiumコンテンツを閲覧するための専用クライアントです。
アプリ内課金（In-App Purchase）は実装していません。

ログインは通常メールOTP（ワンタイムパスワード）方式ですが、審査用に
固定コードでログインできるデモアカウントを用意しています:

  メールアドレス: appreview@trylinerugby.com
  ログインコード: 201914

「コードを送信」をタップ後、届いたコードではなく上記の固定コードを
入力してください。デモアカウントには有効なPremiumエンタイトルメントを
付与済みです。ご不明点があれば support@trylinerugby.com までご連絡ください。
```

固定コードログインは `specs/feat-app-review-demo-login-bypass.md` で実装（Codex実装待ち）。実装・デプロイ後、Ownerが`APP_REVIEW_DEMO_EMAIL`/`APP_REVIEW_DEMO_OTP`をVercel環境変数に設定してから、上記文案の角括弧部分を実際の値で埋めてApp Store Connectに貼り付ける。**審査承認後は環境変数を速やかに未設定に戻すかコードをローテーションすること**（放置すると恒久的な認証バイパスとして残ってしまう）。

## 3. Premiumデモアカウント準備手順（Owner実行）

Claude Codeは本番Supabaseへの `INSERT` を実行しない方針（CLAUDE.md）のため、以下はOwnerまたはCodex依頼で実行する。

1. ~~`support+appreview@trylinerugby.com` 等、Owner が受信できるメールアドレスでアプリからサインアップ~~ → 完了。`appreview@trylinerugby.com` でOwnerが本番Webアプリからサインアップ済み（2026-08-02。ローカルSimulatorビルドは`.env`未設定のためログイン不可、本番Web経由に切り替え）
2. ~~発行された `user_id` を確認~~ → 完了。`114f98a8-2d56-45fc-bc22-7b5b41147b48`
3. ~~Premiumエンタイトルメントを付与~~ → 完了（2026-08-02）。判定ロジックは`lib/auth/server.ts`の`isProfilePremium`で、`user_profiles.premium_until`が未来日時かどうかのみで決まる（Stripeの実サブスクリプションは不要）。実行したSQL:
   ```sql
   update user_profiles
   set premium_until = now() + interval '1 year'
   where id = '114f98a8-2d56-45fc-bc22-7b5b41147b48'
   returning id, premium_until;
   ```
   結果: `premium_until = 2027-08-02 08:22:43.743204+00`（1行更新）
4. ~~アプリ（Web、またはTestFlight配布後）でログインし、Premiumコンテンツ（recap/preview全文）が閲覧できることを確認~~ → 完了（2026-08-02）。Web版で確認: ネーションズチャンピオンシップ2026第3節アルゼンチン対イングランドのレビュー記事が、ペイウォール表示なしに「次戦への示唆」まで全文表示されることを確認
5. ~~`specs/feat-app-review-demo-login-bypass.md` 実装後、6桁の数字をランダムに生成し、Vercel環境変数に設定する~~ → 完了（2026-08-02）。生成コード `201914` をVercel Production環境に `APP_REVIEW_DEMO_EMAIL=appreview@trylinerugby.com` / `APP_REVIEW_DEMO_OTP=201914` として設定・再デプロイ済み。ダミー資格情報での疎通確認で `POST /api/v1/auth/demo-review-session` が401（kill switch解除済み、404ではない）を返すことを確認
6. ~~TestFlightビルドで、実際に固定コードでログインできることを確認してから審査提出する~~ → 完了（2026-08-02）。当初、TestFlightビルドで「ログイン設定が未設定です」エラーが発生（`src/auth/supabase.ts`の`isSupabaseConfigured()`がfalse）。原因はEASプロジェクトに`EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY`が一度も登録されていなかったこと（`eas env:list`で production/preview/development 全環境が0件と確認）。Owner側で`eas env:create`により両env varを登録 → 新規EASビルド・TestFlight再提出 → 実機で固定コードログインを確認済み
7. 審査承認後、`APP_REVIEW_DEMO_EMAIL`/`APP_REVIEW_DEMO_OTP` を速やかに未設定に戻す（次回審査時に再設定すればよい）

## 4. App Store Connect メタデータ確認チェックリスト

- [x] 年齢区分（Age Rating）— 完了（2026-08-02確認）。グローバルな年齢制限指定：4+
- [x] スクリーンショット（6.9インチディスプレイ、5枚）— 完了（2026-08-02）。`tryline-mobile/docs/app-store-screenshots/`の5枚をメディアマネージャー経由でアップロード済み（1320×2868px、iPhone 16 Pro Max相当）
- [x] アプリ説明文（日本語）— 完了。下書き案がそのまま反映済み（2026-08-02確認）
- [x] キーワード — 完了。下書き案がそのまま反映済み（2026-08-02確認）
- [x] Support URL — 完了。`https://www.trylinerugby.com/legal/tokusho`が設定済み
- [ ] Marketing URL（任意、未設定でも提出可）— 空欄のまま（任意項目のため問題なし）
- [x] コンテンツ著作権情報 — 完了。`© 2026 Tryline`が設定済み
- [x] Unratedのまま提出すると却下されるため、年齢区分は必ず設定する → 4+設定済みのため該当なし

### アプリ説明文・キーワード・著作権情報の下書き案

**アプリ説明文（案）:**
```
Tryline（トライライン）は、海外ラグビーを追いかける日本のファンのための
観戦サポートアプリです。

Six Nations、プレミアシップ、URC、Top 14、ラグビーチャンピオンシップ、
スーパーラグビー・パシフィック、ラグビーワールドカップなど、海外主要大会の
試合日程・スコア・順位表・ラインナップを一つの画面でまとめて確認できます。

主な機能:
・海外主要大会の試合日程とライブスコア
・日本語での試合プレビュー・レビュー（一部有料）
・お気に入りチームの登録と次戦通知
・ネタバレ防止モード（結果を見る前にスコアを隠せます）

本アプリは既存のWeb版（trylinerugby.com）契約者向けの専用クライアントです。
ご利用にはWeb版でのアカウント登録が必要です。
```

**キーワード（案、100バイト以内でカンマ区切り）:**
```
ラグビー,海外ラグビー,シックスネーションズ,プレミアシップ,URC,Top14,ワールドカップ,試合速報,順位表
```

**コンテンツ著作権情報（案、App Store Connectの「著作権」欄）:**
```
© Tryline. 本アプリが表示する試合速報・順位表等のデータは公開情報を基に
編集・生成したものであり、解説記事は独自に生成した日本語コンテンツです。
第三者の著作物を無断で転載することはありません。権利者様からのお申し出は
support@trylinerugby.com までご連絡ください。
```

## 5. プッシュ通知の実配送最終確認（TestFlight実機）

Expo Goでは完全に検証できないため、TestFlightビルドで以下を確認する。

~~prematch通知・content通知・タップ遷移・OFF時未着の実配送確認~~ → 完了（Owner確認、本セッションより前に実施済みで問題なしとの記憶による。今回のTestFlightビルド更新（EAS env var修正）が通知機構自体に影響する変更ではないため、この確認結果は引き続き有効と判断）

## 6. アカウント削除の実データ確認（TestFlight実機 or 本番相当環境）

**コード調査で判明した事実**: `DELETE /api/v1/me` は `client.auth.admin.deleteUser(user.id)` を呼び出す実装で、関連テーブルは全て `auth.users` への外部キーに `on delete cascade` が設定済みと確認できた（`supabase/migrations/` 内、2026-08-02時点）:

| テーブル | cascade設定 |
|---|---|
| `user_profiles`（お気に入りチーム含む） | ✅ on delete cascade |
| `expo_push_tokens` | ✅ on delete cascade |
| `push_subscriptions` | ✅ on delete cascade |
| `chat_free_questions` | ✅ on delete cascade |
| `public.users` | ✅ on delete cascade |

スキーマ上は問題ない設計だが、Owner自身によるテストアカウントでの実削除確認は最終確認として推奨:

1. テストアカウントを作成しお気に入りチーム設定・通知登録を行う
2. アプリから「アカウント削除」を実行
3. Supabase Studio（またはSupabase MCPの`execute_sql`）で `select * from user_profiles where id = '<削除したuser_id>'` 等を実行し、0件になっていることを確認

~~上記の実削除確認~~ → 完了（Owner確認、実施時期は本セッション以前）

## 進捗管理

このドキュメントの各チェックボックスの状態は、Owner自身が更新する。次回「アプリリリース進められそうか」と聞かれたら、このファイルと `specs/fix-ios-privacy-policy-mobile-data.md` のCodex実装状況の両方を確認する。
