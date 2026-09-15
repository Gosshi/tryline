# Codex 指示: 集客・継続利用・課金ファネルを計測可能にする

`specs/feat-growth-funnel-observability.md` を全文読んでから実装すること。

## 対象

- `lib/analytics.ts`: `trackBeginCheckout(params: CtaClickParams)` を追加する
- `app/pricing/pricing-form.tsx`: 認証済みの `form.submit()` 直前にのみ送る
- `tests/lib/analytics-gtag-queue.test.ts` と `tests/app/pricing-page.test.tsx`
- `docs/runbooks/weekly-growth-report.md`（新規）

## 守ること

1. 既存の `trackCtaClick(analytics)` の位置と payload を変えない
2. 未ログインでは認証モーダルだけを表示し、`begin_checkout` を送らない
3. `analytics` が無い場合も既存 submit を維持し、`begin_checkout` は送らない
4. `trial_start`、`purchase`、Stripe route、Webhook、料金 UI は変更しない
5. `source`、`medium`、`campaign`、`term`、`content` を送らない
6. 新規 npm 依存、環境変数、GA4 管理画面変更、定期ジョブを追加しない

`form.submit()` は submit handler を再実行しない。`begin_checkout` はこの直前にだけ置く。

## テスト

- `begin_checkout` のイベント名と payload
- 未ログインでは未送信、ログイン済みでは 1 回送信
- native submit より前に送る
- `analytics` 未指定の submit 維持
- analytics 予約語ガードに `trackBeginCheckout` を加える

## 検証

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

仕様と現状が食い違う場合は実装を止めて Owner に報告すること。
