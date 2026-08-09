# iOS アプリ内課金（RevenueCat）

## 背景

2026-08-06 の App Store 審査で Guideline 3.1.1 によりリジェクトされた。

> The app accesses digital content purchased outside the app, such as Premium plan, but that content isn't available to purchase using In-App Purchase.

現在のアプリは Web（Stripe）で購入した Premium をログインで解放する一方、アプリ内に購入手段が一切ない。`src/matches/ContentSection.tsx:110-111` が「続きは Premium でお読みいただけます。」「Premium をお持ちの方はログインしてください」を表示し、`app/(tabs)/settings.tsx:63` も同旨を案内している。アプリ内に `/pricing` への誘導や価格表記は無く、外部購入への誘導（anti-steering）違反は無い。純粋に「IAP が無い」ことだけが問題である。

Apple のルールは、アプリ外で購入したコンテンツへのアクセスを認める条件として **同じものが IAP でも購入できること** を求めている（Guideline 3.1.3(b) Multiplatform Services）。したがって IAP を追加すれば、**既存の Web 契約者は再購入不要でログインするだけでよい**。

`specs/feat-ios-app-mvp.md`（7行目・32行目）および `docs/decisions.md` の D014 では「v1 は IAP なし」「IAP / StoreKit は v1.1 で判断」としていた。本 spec がその v1.1 の判断にあたる。決定記録の更新が必要（未解決の質問を参照）。

### 既存 entitlement の構造

`user_profiles` に既に次のカラムがある（`supabase/migrations/20260714084400_add_premium_entitlement_columns.sql`）。

```sql
premium_until timestamptz,
premium_source text check (premium_source in ('stripe', 'apple', 'manual'))
```

判定は `isProfilePremium`（`lib/auth/server.ts:67-75`）で `premium_until` の期限比較のみを行い、課金元に依存しない。`premium_source` の許容値に `'apple'` が既に含まれているため、**スキーマ変更なしで IAP を載せられる**。

## スコープ

対象:
- モバイル（`tryline-mobile`）: RevenueCat SDK 導入、購入フロー、購入の復元、設定画面での契約状態表示
- Web（`tryline`）: RevenueCat webhook 受信エンドポイント、entitlement 同期エンドポイント
- Stripe 契約者と Apple 契約者の共存ルール

対象外:
- **Android / Google Play 課金**（RevenueCat は将来そのまま流用できるが本 spec では扱わない）
- Stripe 側の変更。Web の課金フローは現状維持
- 価格の変更・プラン構成の変更（Free / Premium の2層のまま）
- 無料トライアル・イントロ価格の設計
- 家族共有、プロモーションコード、オファーコード
- App Store Connect / RevenueCat ダッシュボードの設定（Owner の作業）
- `user_profiles` のスキーマ変更

## データモデル変更

**なし。マイグレーション不要。** 既存の `premium_until` / `premium_source` を使う。

- Apple 由来の権利は `premium_source = 'apple'`、`premium_until` に失効予定日時を入れる
- Webhook は同じイベントが再送されうるが、`premium_until` の上書きは冪等なので追加の重複排除テーブルは設けない

## API サーフェス

### 1. RevenueCat Webhook

`app/api/webhooks/revenuecat/route.ts`

- `POST` のみ。`runtime = "nodejs"`
- 認証: RevenueCat が送る `Authorization` ヘッダを環境変数 `REVENUECAT_WEBHOOK_SECRET` と定数時間比較する。不一致は 401
- 扱うイベント種別: `INITIAL_PURCHASE` / `RENEWAL` / `PRODUCT_CHANGE` / `CANCELLATION` / `UNCANCELLATION` / `EXPIRATION` / `BILLING_ISSUE` / `SUBSCRIPTION_PAUSED` / `REFUND`
- 反映ルール: イベントの `app_user_id` を Supabase の `user_id` として解決し、`expiration_at_ms` から `premium_until` を、`premium_source = 'apple'` を書き込む。失効系イベント（`EXPIRATION` / `REFUND`）は `premium_until` を当該時刻に設定する（過去日時になれば自動的に非 Premium になる）
- `app_user_id` が Supabase の user_id として解決できない場合（匿名 ID のまま等）は **書き込まず 200 を返す**。RevenueCat に再送させない。同期はクライアント側の同期エンドポイントで回収する
- **`premium_source = 'stripe'` かつ `premium_until` が未来の profile は上書きしない。** Stripe の権利を Apple のイベントで縮めないため。ログに記録して skip する
- 書き込みは service role（`lib/db/server.ts`）

### 2. Entitlement 同期エンドポイント

`app/api/v1/me/entitlement/sync/route.ts`

- `POST` のみ。ログイン必須（未ログインは 401）
- RevenueCat REST API に対して当該ユーザーの subscriber 情報を問い合わせ、`entitlements` の有効期限を取得して `premium_until` / `premium_source` を更新する
- 用途: 匿名購入 → ログインで alias された直後や、webhook を取りこぼした場合の回収。モバイル側が購入完了時とログイン完了時に呼ぶ
- API キーは `REVENUECAT_SECRET_API_KEY`（サーバー専用。クライアントに渡さない）
- webhook と同じく、`premium_source = 'stripe'` かつ有効期限が未来の場合は上書きしない

### 3. 環境変数

`lib/env.ts` に追加する。

```
REVENUECAT_WEBHOOK_SECRET: z.string().optional(),
REVENUECAT_SECRET_API_KEY: z.string().optional(),
```

モバイル側の公開 SDK キーは `EXPO_PUBLIC_REVENUECAT_IOS_KEY` として `tryline-mobile` の EAS 環境変数に設定する（公開鍵なのでクライアント同梱で問題ない）。

## UI サーフェス

すべて `tryline-mobile` 側。

### 購入導線

`src/matches/ContentSection.tsx` の paywall（現行 109〜111行）に購入 CTA を追加する。

- `isPremium` が false のとき: 「Premium に登録」ボタンを表示し、押下で RevenueCat の offering から現在の商品を取得して購入を開始する
- `isPremium` が true のとき: 購入 CTA を出さず、コンテンツを表示する
- 価格は **RevenueCat から取得した `priceString` をそのまま表示する**。アプリ内にハードコードした価格を書かない（通貨・地域・改定に追従できなくなるため）

### 設定画面

`app/(tabs)/settings.tsx` に次を追加する。

- 現在の契約状態（未契約 / Premium・失効日）
- 「購入を復元」ボタン（`Purchases.restorePurchases()`）。**Apple の必須要件**
- 「サブスクリプションの管理」— iOS の設定アプリのサブスクリプション画面を開く
- 既存の「Premium をお持ちの方はログインするとコンテンツを閲覧できます。」の文言は、購入導線ができたことに合わせて見直す。ただし **Web で購入するよう促す表現・外部サイトの決済ページへのリンクは入れない**（anti-steering 違反になる）

### ユーザー ID の扱い

- 未ログインでも購入できるようにする。RevenueCat の匿名 ID のまま購入させる
- ログイン成功時に `Purchases.logIn(supabaseUserId)` を呼んで匿名 ID を alias する
- 購入完了時とログイン完了時の両方で、上記の entitlement 同期エンドポイントを呼ぶ

### Stripe 契約者の扱い

`/api/v1/me` が返す `isPremium` が true の場合、購入 CTA を表示しない。Web で契約済みのユーザーに二重課金させないため。表示は「ご利用中」とし、解約導線は出さない（Stripe 側の解約は Web で行う）。

## LLM 連携

なし。

## 受け入れ条件

1. 未ログイン状態でアプリから Premium を購入でき、購入後にコンテンツが解放される。
2. ログイン後に `Purchases.logIn` が呼ばれ、購入が Supabase の user と紐付く。紐付け後に別端末でログインしても Premium が有効になる。
3. 「購入を復元」で、同じ Apple ID の既存購入が復元される。
4. `premium_source = 'stripe'` かつ有効期限が未来のユーザーに、購入 CTA が表示されない。
5. RevenueCat webhook が `Authorization` ヘッダ不一致で 401 を返す。
6. `EXPIRATION` / `REFUND` イベントで `premium_until` が失効時刻に更新され、以後 `isPremium` が false になる。
7. webhook と同期エンドポイントのいずれも、`premium_source = 'stripe'` かつ有効期限が未来の profile を上書きしない。
8. `app_user_id` を Supabase user として解決できない webhook イベントで、書き込みを行わず 200 を返す。
9. 同じ webhook イベントを2回送っても結果が変わらない（冪等）。
10. アプリ内に外部決済ページへのリンク・Web で購入を促す文言が存在しない。
11. 価格表示が RevenueCat から取得した文字列で、ハードコードされていない。
12. Web / モバイル両リポジトリで `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build`（モバイルは該当するコマンド）が clean。

## 未解決の質問

1. **Owner の作業（実装完了だけでは審査に出せない）**
   - App Store Connect で自動更新サブスクリプションを作成する
   - Small Business Program に登録する（年間収益 $1M 未満なら手数料 30% → 15%）
   - RevenueCat アカウントを作成し、App Store Connect と接続、商品をマッピング、webhook URL とシークレットを設定する
   - `REVENUECAT_WEBHOOK_SECRET` / `REVENUECAT_SECRET_API_KEY` を Vercel 本番に設定する
   - `EXPO_PUBLIC_REVENUECAT_IOS_KEY` を EAS に設定する（過去に EAS への env 登録漏れで事故があったため要注意）

2. **iOS の価格を Web と揃えるか。** Web は ¥980/月。同額にすると Apple の手数料ぶん利益が減る。iOS のみ高く設定することは Apple のルール上問題ないが、ユーザーから見た不整合をどう扱うか。Owner の判断が必要で、実装はブロックしない（App Store Connect の設定値のため）。

3. **`docs/decisions.md` の D014 更新。** 「v1 は IAP なし」から「審査 Guideline 3.1.1 のため IAP を実装。RevenueCat 経由」への変更記録が必要。`specs/feat-ios-app-mvp.md` の7行目・32行目も実態と食い違うため、追記か参照リンクが要る。

4. **サポートページの解約手順との整合。** `specs/feat-support-page.md` で Premium の解約手順を記載する。iOS 側の手順は本 spec の実装確定後に具体化する。

5. **既存 Stripe 契約者は再購入不要**（Guideline 3.1.3(b)）。本 spec 作成時点で有料購読者は存在しないため移行作業も不要だが、設計としては上記の共存ルールで担保する。
