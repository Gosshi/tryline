# 大会ハブから試合コンテンツへの遷移計測

大会ハブの「次戦」「最新レビュー」「日本代表の次戦」は検索流入後の主要な回遊導線である。既存UIを変えず、`cta_click` に大会・シーズン・遷移先試合を付けて計測する。対象外は文言、配置、決済、ニュースレター、試合データの変更。

## 受け入れ条件

1. 3導線が `TrackedLink` になり、`hub_summary_next_match`、`hub_summary_latest_review`、`hub_summary_japan_next_match` を送る。
2. 既存 href と表示は維持する。
3. `competition_slug`、`season`、`match_id`、`destination: "match"` を送る。
