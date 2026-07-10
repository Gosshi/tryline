# GA4のpurchaseイベントがトライアル開始時に誤発火する問題を修正

## 背景

2026-07-10、Codex（新モデル）による収益化戦略分析で発見された計測バグ。

`components/checkout-success-tracker.tsx` は、Stripe Checkout成功後のリダイレクト（`?checkout=success`）を検知した際、以下2つのGA4イベントを**同時に**発火している:

```
gtag("event", "purchase", { currency: "JPY", value: 980 });
gtag("event", "trial_start");
```

しかしTrylineのPremiumは7日間無料トライアル付きであり、Checkout成功はトライアルの開始を意味するだけで、実際の課金（¥980の引き落とし）はまだ発生していない。にもかかわらず `purchase` イベントに `value: 980` を添えて発火しているため、**GA4上ではトライアル開始者全員が即座に「¥980購入」として記録されてしまう**。これは以下の実害がある:

- GA4の収益指標（purchase value合計）が実際の売上と一致しない
- トライアルからキャンセルしたユーザーの分も「購入」として残り続け、実際の有料転換率を過大評価する
- Codexの収益化分析でも「実際の有料転換はGA4のpurchaseではなくStripe/Supabaseを正とすべき」と明記されており、この誤計測が既に分析の障害になっている

## スコープ

対象:
- `components/checkout-success-tracker.tsx` から、実際の課金が発生していない時点での `purchase` イベント発火を削除する
- Checkout成功（トライアル開始）時には `trial_start` イベントのみを発火する
- 実際の課金（トライアル終了後の初回引き落とし、またはStripe Webhookでの決済確定）が発生したタイミングで `purchase` イベントを発火する仕組みを検討する。Stripe Webhook（`app/api/stripe/webhook/route.ts`）が課金確定イベント（`invoice.payment_succeeded` 等）を受け取った際に、サーバーサイドからGA4 Measurement Protocol経由で `purchase` イベントを送るのが望ましいが、実装コストと既存のWebhook実装を見て判断してよい

対象外:
- Stripe Webhookの本番運用開始・実際の課金フロー自体の変更（これはOwnerの別判断）
- 過去に誤って記録された `purchase` イベントの実測データ修正（GA4側では遡及修正不可のため対象外）

## データモデル変更

なし。

## API サーフェス

Stripe Webhook経由でサーバーサイドから `purchase` イベントを送る設計にする場合、GA4 Measurement Protocol呼び出しが `app/api/stripe/webhook/route.ts` に追加される可能性がある（実装方針はCodexの判断）。

## 受け入れ条件

1. `components/checkout-success-tracker.tsx` が、Checkout成功時に `purchase` イベントを発火しない（`trial_start` のみ発火する）ことがテストまたはコードレビューで確認できる
2. 実際の課金確定タイミングで `purchase` イベントを発火する仕組みが実装されている、または実装しない場合はその理由（実装コスト・優先度）を完了報告に明記する
3. 既存のStripe Webhook処理（`app/api/stripe/webhook/route.ts`）の他の処理に回帰がない
4. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
5. 本番デプロイはOwner承認後に別途行う

## 未解決の質問

- 課金確定タイミングでのGA4 `purchase` イベント送信を、クライアントサイド（例: 顧客ポータルからの遷移時）とサーバーサイド（Stripe Webhook経由のMeasurement Protocol）のどちらで実装するのが適切かはCodexの判断に委ねる。実装コストが高い場合は「trial_start と purchase を混同しない」ことだけを最優先に対応し、正確なpurchase計測の実装は別specの候補として完了報告に記載してよい
