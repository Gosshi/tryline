---
name: funnel-audit
description: サイト内導線の監査。「動線を見て」「CVR改善」「トライアルが増えない」「ファネル分析」と言われたら起動。クリック、登録、購読、実課金を区別する。
---

# funnel-audit

共通参照: [運用方針と測定基準](../today/references/operating-baseline.md)。

流入分析はgrowth-analysis、課金イベント/権限の突合はbilling-monitorへ渡す。担当は訪問後の段差。
1. LP→試合/サンプル→pricing→Checkout→trial→実課金の各段を、現在の`lib/analytics.ts`と計測コンポーネントに対応づける。イベント名・cta_id・発火条件・母数・期間・取得日を記録する。
2. newsletter_subscribe、確認ページ表示、DB購読状態、配信成功は別イベントとして扱う。別期間/別ユーザーの件数比をコホート転換率と呼ばない。
3. 公開ページを未ログインで歩き、SSRとhydration後のCTA、キーボード操作、画面幅別の到達性を確認する。Checkout送信・決済・本番購読登録は行わない。
4. GA4のpurchase=0を有料契約ゼロと断定しない。料金・特商法・Checkoutコードの条件差はbilling-monitorへ具体的なパス付きで渡す。
5. 小さい母数では絶対件数と導線の有無を示し、率の改善や読了を推定しない。A/B案には成立する母数と測定期間が必要。

出力は段ごとの観測表、再現URL/CTA、未確認事項、修正候補とする。既存のcta_idを変える提案は計測の連続性への影響を明記する。実装はspec-writing→Codexへ。外部送信・計測設定の変更は依頼範囲外で行わない。
