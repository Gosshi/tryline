---
name: prod-investigation
description: 本番データの読み取り調査。「本番DBを調べる」「recapがない原因」「データの原因調査」と言われたら起動。再現可能なSELECTとコード経路から原因を切り分ける。
---

# prod-investigation

共通参照: [運用方針と測定基準](../today/references/operating-baseline.md)。

定期検出はproduction-data-integrity、本スキルは個別の原因調査。機密env・ignoredファイル・他プロジェクトへアクセスしない。
1. 対象match_id/期間/プロジェクトをセッション情報と認可済み読取接続で確認する。SQLはSELECTのみを基本に、secretを含まない最小列を取得する。
2. lib/db/types.tsとmigrations、現在のqueriesを読んで列名・NULL・JSON格納を確定する。match_eventsの人名はmetadata.player_nameでありplayer_idだけを見ない。
3. 件数・合計・第三チーム・署名・source fixture対応を検査し、入力→保存→集約→本文→公開API/画面のどこで食い違うか追う。現在値と生成時点の値を分ける。
4. ログの検出日時と通知内容を確認し、「検出なし」と「検出済みだが行動につながらず」を区別する。完了済みPRはHEADで再確認する。
5. ページングや取得失敗を隠さず、全件/サンプル/未取得の範囲を報告する。古いデータ欠落率を現在値として引用しない。

結果は事実（SQL/取得条件/件数/取得時刻）→仮説→検証→修正候補。監査中に修復を実行しない。Claude Codeによる本番UPDATEは、別途具体的な対象・条件のOwner承認がある場合だけCLAUDE.mdに従う。INSERT/DELETE/DDLは実行しない。Codexへの実装委譲は本番操作の許可を意味しない。
