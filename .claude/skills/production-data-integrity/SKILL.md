---
name: production-data-integrity
description: 本番データ整合性の定期監査。「データの整合監査」「イベント汚染チェック」「整合通知を確認」と言われたら起動。検出結果を対象と行動が分かる形へまとめる。
---

# production-data-integrity

共通参照: [運用方針と測定基準](../today/references/operating-baseline.md)。

本番は読み取り専用。lib/data-integrity/audit.ts、notify.ts、cron-audit-data-integrityと関連仕様を現在のHEADで確認する。個別の原因追跡はprod-investigationへ渡す。
1. 対象期間・試合/記事/languageの母数・取得時刻・全件取得の可否を記録する。公開APIのサンプルを全件監査と呼ばない。途中取得失敗は未完了とする。
2. 得点はlib/format/match-event-points.tsを正とし、metadata.is_penalty_tryを含める。finished/score null/events0、第三チームを別扱いする。player_nameはmetadataから読み、player_id nullを不明扱いしない。
3. 署名一致、帰属の全件/一部反転、source namespaceとfixture IDの重複を確認する。短署名・名前欠損・同点の限界を示し、C4だけでどちらの試合が汚染側か断定しない。
4. 現在のイベント、公開本文、生成時点の根拠を分ける。公開記事の有無とURL、最初/最後の検出、前回との差分を付ける。
5. 件数だけの通知を完了としない。重大度・match_id/URL・理由・公開状態・担当・次の行動・確認期限を揃える。既に検出されていた事故を「検出機構なし」と書かない。
6. 自動削除/修正/unpublish/再生成はしない。確定と疑いと判定不能を分け、Ownerが対象別に復旧方針を決められる一覧を渡す。LLM監査が必要な場合は費用と承認範囲を別に確認する。

出力はsummary、対象別findings、未取得/判定不能、前回の未解決項目と対応状況。監査結果のJSON/CSVは個人情報を除き、許可された保存先へ。ignored出力へのアクセスは暗黙に許可しない。
