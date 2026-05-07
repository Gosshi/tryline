# Stripe セットアップ手順

pr18（Auth + Stripe）実装後に Owner が手動で行う設定。
テストモードで動作確認してから本番に切り替える。

## アカウント構成

- **Organization**: `Gosshi`（屋号。将来の別サービスも同じ傘下に追加）
- **Account**: `Tryline`（このプロジェクト専用）

---

## 1. Stripe Dashboard で商品を作成

1. Stripe Dashboard にログイン
2. **テストモード**であることを確認（右上のトグル）
3. `製品カタログ` → `製品を追加`
4. 設定:
   - 製品名: `Tryline Premium`
   - 価格: `¥980` / 月払い / 継続課金
5. 作成後、価格 ID（`price_xxx`）をコピーして控える

---

## 2. Webhook エンドポイントを登録

1. `開発者` → `Webhook` → `エンドポイントを追加`
2. エンドポイント URL:
   ```
   https://tryline-six.vercel.app/api/stripe/webhook
   ```
3. リッスンするイベントを選択:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. 追加後、署名シークレット（`whsec_xxx`）をコピーして控える

---

## 3. Vercel 環境変数に追加

Vercel Dashboard → プロジェクト → `Settings` → `Environment Variables`

| 変数名 | 値 | 環境 |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_xxx` | Production + Preview |
| `STRIPE_WEBHOOK_SECRET` | `whsec_xxx` | Production |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_xxx` | Production + Preview |
| `STRIPE_PREMIUM_PRICE_ID` | `price_xxx` | Production + Preview |
| `NEXT_PUBLIC_SITE_URL` | `https://tryline-six.vercel.app` | Production |

追加後、Vercel を再デプロイ（自動または手動）。

---

## 4. 動作確認（テストモード）

1. `/pricing` にアクセス
2. 「Premium を始める」ボタンを押す
3. Stripe Checkout でテストカード `4242 4242 4242 4242`、有効期限・CVC は任意
4. 決済完了後、Supabase の `user_profiles` で `subscription_status = 'premium'` になっていることを確認
5. `/matches/[id]` で AI チャットが使えることを確認

---

## 5. 本番切り替え時

1. Stripe Dashboard を本番モードに切り替え
2. 同じ手順で商品・Webhook を本番環境に作成
3. Vercel 環境変数の `sk_test_` / `pk_test_` を `sk_live_` / `pk_live_` に差し替え
4. 本番 Webhook の `whsec_xxx` も差し替え

---

## 参照

- 仕様書: `specs/p2-stripe-subscription.md`
- 実装: `app/api/stripe/`
