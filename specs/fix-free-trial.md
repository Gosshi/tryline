# Premium 7日間無料トライアル導入

## 背景

現状、無料ユーザーが有料機能（recap 全文・AI チャット）を一度も体験せずに ¥980 の課金を求められる。
FAQ でも「無料トライアルはありますか？ → 現在、プレビュー記事でご確認ください」と明言しており、転換率が低い。
Stripe の `trial_period_days` は checkout session 1行の追加で実装できる。
webhook はすでに `trialing` ステータスを `premium` として扱う（`app/api/stripe/webhook/route.ts:24`）。

## スコープ

対象:
- `app/api/stripe/checkout/route.ts` — `trial_period_days: 7` を追加
- `app/pricing/page.tsx` — CTA コピーとトライアル説明を更新

対象外:
- トライアル終了リマインダーメール（Stripe の自動メール機能に任せる）
- トライアル期間中の機能制限（現行の premium 判定をそのまま使う）
- ダッシュボード上のトライアル残日数表示

## データモデル変更

なし（`subscription_status = 'premium'` の扱いはトライアル中も変わらない）。

## API サーフェス

### `app/api/stripe/checkout/route.ts`

`subscription_data` に `trial_settings` と `trial_period_days` を追加する:

```typescript
subscription_data: {
  metadata: { userId: user.id },
  trial_period_days: 7,
  trial_settings: {
    end_behavior: { missing_payment_method: "cancel" },
  },
},
```

- `trial_period_days: 7` — 7日間のトライアル
- `end_behavior.missing_payment_method: "cancel"` — カード情報なしで終了したらキャンセル
- Stripe checkout でカード入力は必須のまま（トライアル後に自動課金）

## UI サーフェス

### `app/pricing/page.tsx`

**Hero CTA ボタン（`PricingForm` の `buttonLabel`）:**
```
変更前: "Premium を始める — ¥980/月"
変更後: "7日間無料で試す"
```

**ボタン直下のサブコピー:**
```
変更前: "いつでもキャンセル可能 · Stripe 決済"
変更後: "7日間無料 · その後 ¥980/月 · いつでもキャンセル可能 · Stripe 決済"
```

**FAQ 更新:**
```
Q: 無料トライアルはありますか？

変更前: "現在、無料のプレビュー記事（試合前分析）をご登録なしでお読みいただけます。
        レビュー記事と AI チャット機能は Premium 会員限定ですが、
        まずはプレビュー記事でコンテンツの質をお確かめください。"

変更後: "はい。初回登録時に 7 日間の無料トライアルをご利用いただけます。
        トライアル期間中は AI 日本語レビュー全文・AI チャットを含む
        すべての Premium 機能をお使いいただけます。トライアル終了後は
        自動的に ¥980/月の課金が始まります。期間中はいつでもキャンセル可能です。"
```

## LLM 連携

なし

## 受け入れ条件

1. Stripe テストモードで checkout を完了すると subscription status が `trialing` になり、`/api/me/premium` が `{ isPremium: true }` を返す。
2. Pricing ページの CTA ボタンラベルが「7日間無料で試す」になっている。
3. FAQ の「無料トライアルはありますか？」の回答がトライアル内容を説明している。
4. `tsc --noEmit` でビルドエラーなし。

## 未解決の質問

- カードなしトライアル（`payment_method_collection: "if_required"`）にする場合は別途判断。現状はカード登録必須のまま。