# p2-stripe-subscription: 課金・サブスクリプション

## 背景

Tryline の収益源は ¥980/月 の Premium プラン。
p2-auth 実装後に導入する。Stripe Checkout + webhook で実装し、
自前の課金ロジックは持たない。

## スコープ

対象:
- Stripe Checkout セッション作成
- Stripe webhook 受信（subscription 状態同期）
- Customer Portal（解約・カード変更）
- Premium/Free コンテンツ出し分け（paywall コンポーネント）
- 料金ページ

対象外:
- 年払いプラン（MVP では月払いのみ）
- チーム・法人プラン
- 請求書発行

## プラン定義

| ティア | 月額 | 含まれるもの |
|---|---|---|
| Free | ¥0 | 試合スコア・順位表・recap 冒頭 300文字 |
| Premium | ¥980 | recap 全文・preview 全文・AI チャット |

## データモデル変更

### `user_profiles` への追加カラム（p2-auth のテーブルを拡張）

| カラム | 型 | 説明 |
|---|---|---|
| stripe_customer_id | text | Stripe Customer ID (`cus_xxx`) |
| stripe_subscription_id | text | Stripe Subscription ID (`sub_xxx`) |
| subscription_status | text | `'free'` / `'premium'` / `'cancelled'` |
| current_period_end | timestamptz | 現在の課金期間終了日 |

RLS: 本人のみ read 可。webhook からの書き込みは service role key で実行。

## API サーフェス

| ルート | メソッド | 役割 |
|---|---|---|
| `/api/stripe/checkout` | POST | Checkout セッション作成、URL を返す |
| `/api/stripe/webhook` | POST | Stripe webhook 受信・処理（署名検証必須） |
| `/api/stripe/portal` | POST | Customer Portal セッション作成 |

### webhook で処理するイベント

| イベント | 処理 |
|---|---|
| `customer.subscription.created` | `subscription_status = 'premium'` に更新 |
| `customer.subscription.updated` | status に応じて同期 |
| `customer.subscription.deleted` | `subscription_status = 'cancelled'` に更新 |

## UI サーフェス

### 料金ページ（`app/pricing/page.tsx`）

- Free / Premium の比較テーブル
- 「Premium を始める」ボタン → Checkout にリダイレクト
- ログイン必須（未ログインは auth モーダルを表示）

### Paywall コンポーネント（`components/paywall.tsx`）

- `isPremium=false`: コンテンツをぼかし + 「続きを読む（Premium）」CTA
- `isPremium=true`: children をそのまま表示

### ユーザーメニュー拡張

- Premium バッジ表示
- 「プランを管理する」→ Customer Portal へのリンク

## 新規環境変数

```
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_PREMIUM_PRICE_ID=price_xxx
```

## 受け入れ条件

- [ ] 「Premium を始める」→ Stripe Checkout → 成功後に `subscription_status = 'premium'` になる
- [ ] webhook 署名検証が通らないリクエストは 400 を返す
- [ ] サブスクリプション削除後に `'cancelled'` になる
- [ ] Premium ユーザーは recap/preview 全文を読める
- [ ] Free ユーザーには paywall が表示される
- [ ] Customer Portal から解約できる
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

- 無料トライアル期間を設けるか（7日 or なし）
- Stripe のロケールを `ja` に設定するか
- 解約後: `current_period_end` まで premium アクセス維持か即時停止か
