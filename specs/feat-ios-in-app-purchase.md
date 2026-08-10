# iOS アプリ内課金（RevenueCat）

## 背景

2026-08-06 の App Store 審査で Guideline 3.1.1 によりリジェクトされた。

> The app accesses digital content purchased outside the app, such as Premium plan, but that content isn't available to purchase using In-App Purchase.

現在のアプリは Web（Stripe）で購入した Premium をログインで解放する一方、アプリ内に購入手段が一切ない。`src/matches/ContentSection.tsx:110-111` が「続きは Premium でお読みいただけます。」「Premium をお持ちの方はログインしてください」を表示し、`app/(tabs)/settings.tsx:63` も同旨を案内している。アプリ内に `/pricing` への誘導や価格表記は無く、外部購入への誘導（anti-steering）違反は無い。純粋に「IAP が無い」ことだけが問題である。

Apple のルールは、アプリ外で購入したコンテンツへのアクセスを認める条件として **同じものが IAP でも購入できること** を求めている（Guideline 3.1.3(b) Multiplatform Services）。したがって IAP を追加すれば、**既存の Web 契約者は再購入不要でログインするだけでよい**。

`specs/feat-ios-app-mvp.md` および `docs/decisions.md` の D014 では「v1 は IAP なし」「IAP / StoreKit は v1.1 で判断」としていた。本 spec がその判断にあたる。**決定記録は 2026-08-10 に更新済み**（`docs/decisions.md` の D015 が D014 決定4を撤回。`specs/feat-ios-app-mvp.md` の該当箇所にも参照を追記済み）。

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

`app/api/revenuecat/webhook/route.ts`

既存の唯一の webhook である `app/api/stripe/webhook/route.ts` と同じ `app/api/<provider>/webhook/route.ts` の並びに揃える。本番の登録先 URL は `https://trylinerugby.com/api/revenuecat/webhook` になる。

- `POST` のみ。`runtime = "nodejs"`
- 認証: RevenueCat が送る `Authorization` ヘッダを環境変数 `REVENUECAT_WEBHOOK_SECRET` と定数時間比較する。不一致は 401
- 扱うイベント種別: `INITIAL_PURCHASE` / `RENEWAL` / `PRODUCT_CHANGE` / `CANCELLATION` / `UNCANCELLATION` / `EXPIRATION` / `BILLING_ISSUE` / `SUBSCRIPTION_PAUSED` / `REFUND`
- 反映ルール: イベントの `app_user_id` を Supabase の `user_id` として解決し、`expiration_at_ms` から `premium_until` を、`premium_source = 'apple'` を書き込む
- **失効系イベント（`EXPIRATION` / `REFUND`）は権利を必ず終了させる。** イベント種別ごとに次の通り扱う。

  | 種別 | `premium_until` に書く値 |
  |---|---|
  | 継続系（`INITIAL_PURCHASE` / `RENEWAL` / `PRODUCT_CHANGE` / `UNCANCELLATION` / `CANCELLATION` / `BILLING_ISSUE` / `SUBSCRIPTION_PAUSED`） | `expiration_at_ms` をそのまま |
  | **失効系（`EXPIRATION` / `REFUND`）** | **`min(expiration_at_ms, 現在時刻)`** |

  失効系で `min()` を取る理由は、RevenueCat が `REFUND` に**元の契約満了日（未来の日時）**を入れて送る場合があるため。`expiration_at_ms` をそのまま書くと、**返金済みのユーザーが契約期間の終わりまで有料コンテンツを読み続けられる**。

- **失効系イベントで `expiration_at_ms` が欠けている場合は skip せず、`premium_until = 現在時刻` を書いて失効させる。** 継続系で欠けている場合のみ skip してよい。失効の取りこぼしは課金トラブルに直結するため、判断に迷う場合は権利を止める側に倒す
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

### 3. `/api/v1/me` に失効日を追加

`lib/api/v1/types.ts` の `V1MeData`（189〜193行）は現在 `display_name` / `favorite_team_slugs` / `isPremium` のみで、**失効日を返していない**。設定画面で「Premium・失効日」を表示するには、これをレスポンスに含める必要がある。

- `V1MeData` に **`premium_until: string | null`** を追加する（ISO 8601 の timestamptz。既存フィールドに合わせて snake_case）
- `app/api/v1/me/route.ts` は既に `profile.premiumUntil` を取得して `isProfilePremium` に渡している（44行目）。**新しいクエリは不要**で、同じ値をレスポンスに載せるだけ
- `isPremium` は残す。クライアントが期限比較を再実装しなくて済むようにするため。`premium_until` は表示専用で、**権利判定に使わせない**
- 非 Premium ユーザーには `null` を返す

**`tryline-mobile` 側の `reference/api-types.ts` と `src/api/types.ts` も同時に更新する。** `reference/api-types.ts` は本リポジトリ `lib/api/v1/types.ts` のスナップショットで、mobile の `AGENTS.md`「API コントラクトの正は tryline 本体」により mobile 側で独自に型を足すことは禁止されている。

**この変更は Phase 1（web）の追補として先に入れる。** Phase 2 の設定画面はこのフィールドに依存する。

### 4. 環境変数

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

- `isPremium` が false のとき: 「Premium に登録」ボタンを表示する。押下時の挙動は**ログイン状態で分岐する**
  - **未ログイン**: サインイン画面へ遷移する。購入フローは開始しない。ログイン成功後は元の試合画面へ戻し、続けて購入できる状態にする
  - **ログイン済み**: RevenueCat の offering から現在の商品を取得して購入を開始する
- `isPremium` が true のとき: 購入 CTA を出さず、コンテンツを表示する
- **未ログイン時のボタン文言は、購入がすぐ始まると誤解させないものにする**（「Premium に登録」のままでよいが、遷移先がサインインであることが分かる補助文を添える）。ここでも Web の pricing ページや外部決済に触れてはならない
- 価格は **RevenueCat から取得した `priceString` をそのまま表示する**。アプリ内にハードコードした価格を書かない（通貨・地域・改定に追従できなくなるため）

### 設定画面

`app/(tabs)/settings.tsx` に次を追加する。

- 現在の契約状態（未契約 / Premium・失効日）
- 「購入を復元」ボタン（`Purchases.restorePurchases()`）。**Apple の必須要件**。**ログイン中のみ実行する**（未ログインで押された場合はサインインへ誘導し、復元を走らせない。匿名 ID に権利が付くと Supabase 側と紐付かないため）
- 「サブスクリプションの管理」— iOS の設定アプリのサブスクリプション画面を開く
- 既存の「Premium をお持ちの方はログインするとコンテンツを閲覧できます。」の文言は、購入導線ができたことに合わせて見直す。ただし **Web で購入するよう促す表現・外部サイトの決済ページへのリンクは入れない**（anti-steering 違反になる）

### ユーザー ID の扱い

**購入にはログインを必須とする。匿名購入は行わない。**

- 未ログインで購入 CTA を押した場合、**先にサインイン画面へ誘導し、ログイン成功後に購入フローへ戻す**。未ログインのまま `Purchases.purchase*()` を呼ばない
- ログイン成功時に `Purchases.logIn(supabaseUserId)` を呼ぶ。購入はこの後に開始するため、RevenueCat の `app_user_id` は常に Supabase の user_id になる
- 購入完了時とログイン完了時の両方で、entitlement 同期エンドポイントを呼ぶ
- 「購入を復元」は**ログイン中のみ**実行できる。未ログイン時はログインを促す

**この設計にする理由（2026-08-10 改訂）:**

初版は「未ログインでも購入でき、購入後にコンテンツが解放される」としていたが、**実装不能な矛盾があった**。

- 同期エンドポイントはログイン必須（未ログインは 401）
- webhook は `app_user_id` が Supabase user として解決できない場合、書き込まず 200 を返す（匿名 ID は解決できない）
- Premium ゲートはサーバー側で、locked コンテンツの本文をレスポンスに含めない

匿名購入ではサーバー側に権利が1件も記録されず、コンテンツを解放する手段が存在しない。

「匿名購入 → 後からログイン誘導」も採らない。**支払い直後に何も読めない状態が生まれ**、ログインを放棄されると返金・低評価・審査での指摘に直結するため。

Tryline の Premium は Web（Stripe）とアカウントを共有する multiplatform service であり、Guideline 3.1.3(b) が想定する形態そのものである。購入にアカウントを要求することは Apple のルール上問題ない。審査担当者は `feat-app-review-demo-login-bypass`（mobile PR #57）のデモログインで購入フローを検証できる。

### Stripe 契約者の扱い

`/api/v1/me` が返す `isPremium` が true の場合、購入 CTA を表示しない。Web で契約済みのユーザーに二重課金させないため。表示は「ご利用中」とし、解約導線は出さない（Stripe 側の解約は Web で行う）。

## LLM 連携

なし。

## 受け入れ条件

1. **未ログイン**で購入 CTA を押すと**サインイン画面に遷移し、購入フローは開始されない**（`Purchases.purchase*()` が呼ばれない）。ログイン成功後に購入へ進める。
2. **ログイン済み**で購入すると、購入完了後にコンテンツが解放される。RevenueCat の `app_user_id` が Supabase の user_id になっており、webhook が権利を書き込む。別端末で同じアカウントにログインしても Premium が有効になる。
3. 「購入を復元」がログイン中に動作し、同じ Apple ID の既存購入が復元される。**未ログイン時はログインを促し、復元を実行しない。**
4. `premium_source = 'stripe'` かつ有効期限が未来のユーザーに、購入 CTA が表示されない。
5. RevenueCat webhook が `Authorization` ヘッダ不一致で 401 を返す。
6. `EXPIRATION` / `REFUND` イベントを処理した後、**`isProfilePremium` が false を返す**。以下の3ケースすべてで成立すること。
   - `expiration_at_ms` が過去 → その時刻が書かれる
   - **`expiration_at_ms` が未来** → 現在時刻が書かれる（未来の値をそのまま書かない）
   - **`expiration_at_ms` が欠落** → 現在時刻が書かれる（skip しない）

   テストは書き込み値の一致だけでなく、**書き込んだ `premium_until` を `isProfilePremium` に通して false になること**を検証する。
7. webhook と同期エンドポイントのいずれも、`premium_source = 'stripe'` かつ有効期限が未来の profile を上書きしない。
8. `app_user_id` を Supabase user として解決できない webhook イベントで、書き込みを行わず 200 を返す。
9. 同じ webhook イベントを2回送っても結果が変わらない（冪等）。
10. アプリ内に外部決済ページへのリンク・Web で購入を促す文言が存在しない。
11. 価格表示が RevenueCat から取得した文字列で、ハードコードされていない。
12. `GET /api/v1/me` が Premium ユーザーに対して `premium_until` を ISO 8601 文字列で返し、非 Premium には `null` を返す。`tryline-mobile` の `reference/api-types.ts` が `lib/api/v1/types.ts` と一致している。
13. 設定画面が `premium_until` を表示する（クライアント側で日付を推測・生成していない）。
14. Web / モバイル両リポジトリで `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build`（モバイルは該当するコマンド）が clean。

## 未解決の質問

1. **Owner の作業（実装完了だけでは審査に出せない）**
   - App Store Connect で自動更新サブスクリプションを作成する
   - Small Business Program に登録する（年間収益 $1M 未満なら手数料 30% → 15%）
   - RevenueCat アカウントを作成し、App Store Connect と接続、商品をマッピングする
   - RevenueCat の webhook URL に `https://trylinerugby.com/api/revenuecat/webhook` を設定し、`Authorization` ヘッダに使うシークレットを決める（同じ値を Vercel の `REVENUECAT_WEBHOOK_SECRET` に入れる）
   - `REVENUECAT_WEBHOOK_SECRET` / `REVENUECAT_SECRET_API_KEY` を Vercel 本番に設定する
   - `EXPO_PUBLIC_REVENUECAT_IOS_KEY` を EAS に設定する（過去に EAS への env 登録漏れで事故があったため要注意）
   - **RevenueCat の transfer behavior（購入の移管挙動）を確認する。** 購入は常にログイン済みユーザーに紐づく設計のため、同一 Apple ID で別アカウントにログインして復元したときの扱い（移管する / 元のユーザーに残す）をダッシュボードで明示的に決めておく

2. **iOS の価格を Web と揃えるか。** Web は ¥980/月。同額にすると Apple の手数料ぶん利益が減る。iOS のみ高く設定することは Apple のルール上問題ないが、ユーザーから見た不整合をどう扱うか。Owner の判断が必要で、実装はブロックしない（App Store Connect の設定値のため）。

3. ~~**`docs/decisions.md` の D014 更新。**~~ → **解決済み（2026-08-10）。** `docs/decisions.md` に **D015** を追記し、D014 決定4「v1 は IAP なし」を撤回した。`specs/feat-ios-app-mvp.md` の該当2箇所にも D015 への参照を追記済み。**この作業は完了しており、Codex の実装スコープには含まれない**（AGENTS.md:180-181 により Codex は `specs/*.md` と `docs/decisions.md` を書き換えられない）。

4. **サポートページの解約手順との整合。** `specs/feat-support-page.md` で Premium の解約手順を記載する。iOS 側の手順は本 spec の実装確定後に具体化する。

5. **既存 Stripe 契約者は再購入不要**（Guideline 3.1.3(b)）。本 spec 作成時点で有料購読者は存在しないため移行作業も不要だが、設計としては上記の共存ルールで担保する。
