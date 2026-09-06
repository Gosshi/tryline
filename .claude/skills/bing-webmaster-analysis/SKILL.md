---
name: bing-webmaster-analysis
description: Bing検索の実クエリ分析。「Bingを分析」「BWTを見て」「Bingから何で来る」と言われたら起動。GA4の流入をBing Webmasterの検索実績と照合する。
---

# bing-webmaster-analysis

共通参照: [運用方針と測定基準](../today/references/operating-baseline.md)。

読み取り専用。GSCのクエリでBingの需要を代用しない。全体の流入診断はgrowth-analysisへ渡す。
1. 対象サイト・期間・国/端末・取得日とBWTの権限を確認する。既存のspecs/feat-bing-analysis-script.mdと対応toolを確認し、利用可能な認可済み接続またはOwner提供エクスポートを使う。機密envを読まない。
2. query、page、表示回数、クリック、CTR、順位を取り、ページング・上限・未取得期間を記録する。APIに存在しない指標/粒度を推測で埋めない。
3. GA4のbing/organicを同期間・同じ着地URLで対応づける。BWTクリックとGA4ユーザー/セッションは定義が異なるので一致を要求せず、差の仮説を分ける。
4. 大会family/season、RWC、H2H、日程/放送/順位の検索意図に分類する。少ないクリックの率を成長と断定しない。ブランド/非ブランドを分ける場合は分類語を残す。
5. 技術的問題はcanonical/noindex/sitemapの証拠、内容不足はqueryと実ページの差を示す。インデックス数を公開記事数と混ぜない。

出力: 取得条件、クエリ×着地URL表、前期間差、上位の不足、未確認。必要データが取れないときはOwnerへ必要な非機密列を具体的に伝え、取得できた範囲の分析を続ける。
サイト登録、IndexNow送信、インデックス削除、設定変更は行わない。施策の実装はspec-writing→Codexへ。
