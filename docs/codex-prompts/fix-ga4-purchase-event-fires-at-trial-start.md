`/specs/fix-ga4-purchase-event-fires-at-trial-start.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- バグの現物は `components/checkout-success-tracker.tsx` にある。`purchase` と `trial_start` を同時発火している箇所を確認すること
- Stripe Webhookの既存実装は `app/api/stripe/webhook/route.ts` を読んで、どのイベントタイプ（`invoice.payment_succeeded` 等）が既に処理されているか確認すること
- GA4への送信方法は、クライアントサイドは `window.gtag`、サーバーサイドから送る場合はGA4 Measurement Protocol（HTTPS POST）を使う。プロジェクト内に既存のサーバーサイドGA4送信の実装例があるか `grep -rn "measurement" lib/` 等で確認すること

入出力の例:
- Checkout成功時（`?checkout=success`）: `trial_start` イベントのみ発火、`purchase` イベントは発火しない
- （実装する場合）Stripe Webhookが `invoice.payment_succeeded` を受け取った時: サーバーサイドから `purchase` イベントを送信

処理すべきエッジケース:
- トライアルなしで即時課金するプランが将来追加された場合の考慮は不要（現状は7日間トライアルのみ）
- サーバーサイドGA4送信の実装コストが高い、または既存のCookie/クライアントID紐付けの仕組みがない場合は、無理に実装せず「trial_startとpurchaseを混同しない」修正のみ行い、完了報告で正確なpurchase計測実装を別spec候補として提示してよい

完了の定義:
- specs の受け入れ条件 1〜4 をすべて満たす（受け入れ条件5の本番デプロイはOwnerが別途行うため対象外）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean

要件:
- スコープ対象外（Stripe本番運用開始、過去の誤計測データの修正）は実装しない
- 実装方針に迷う場合は完了報告で質問として提示する

完了時:
- 実装内容、変更ファイルを要約する
- purchase イベントの正確な計測をどう実装したか（またはしなかった場合の理由）を明記する
- 仕様書からの逸脱があれば理由を明示する
