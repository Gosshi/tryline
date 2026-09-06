---
name: billing-monitor
description: 課金と権限の監視。「決済を点検」「Premiumが付かない」「Webhook監視」「課金状況」と言われたら起動。契約・支払・権限・計測を区別して確認する。
---

# billing-monitor

共通参照: [運用方針と測定基準](../today/references/operating-baseline.md)。

本番のStripeキーを扱わず、決済/返金/解約/再送/価格変更を行わない。Ownerが確認した非機密の証拠と認可済みの読取情報を使う。
1. 現行Checkoutのtrial指定、Stripe/RevenueCatのWebhook、Premium判定、pricing/特商法/termsを読む。実条件はProduct/Price画面だけでなくCheckout Session/Subscriptionの適用条件と照合する。
2. 契約作成、trial、請求、支払成功、Webhook配送、DB書込み、Premium権限を別段として時系列にする。GA4 purchase=0だけで課金実績ゼロと断定しない。
3. event.id/type、対応ユーザーの存在、受信時刻、HTTP結果、安全なDBエラー分類、権限の期限を突合する。外部向けレポートではユーザー識別を最小化し、メール/カード/顧客詳細/生payloadは出さない。
4. DB errorなのに200、update対象0行、userId欠落、通知失敗、古いeventの再送、Stripe/Apple併用を確認する。upsertだけで順不同が安全とはしない。
5. 回帰確認は署名/DB/通知をモックしたテスト、またはOwner承認済みのテスト環境で行う。本番キー/個人契約の秘密値を要求しない。

出力は段ごとの確認済み/異常/未確認、影響範囲、event参照、安全な調査手順。復旧は対象と条件を具体化してOwnerへ渡す。監視コードの追加は仕様化してCodexへ。
