---
name: content-qa
description: 記事の根拠と表現の監査。「コンテンツ品質」「捏造チェック」「recapの密度」と言われたら起動。入力データの整合と本文の根拠対応を分けて評価する。
---

# content-qa

共通参照: [運用方針と測定基準](../today/references/operating-baseline.md)。

読み取り専用。match_idを単位に対象期間・content_type・language・prompt_version・生成日・公開状態を記録する。
1. production-data-integrityでイベントのスコア/第三チーム/署名/fixtureを確認する。スコア一致だけで選手名や試合帰属まで正しいと保証しない。player_idがnullでもmetadata.player_nameを見る。
2. 本文の数値・選手名・時系列・MOM・戦術因果を、現在のDBとsourced_factsの具体的根拠へ対応づける。現在データの照合を生成時点の再現と呼ばない。
3. entity allowlist違反は候補であり、allowedEntityCount=0だけで捏造確定としない。名前表記・チーム/大会名・参照範囲を確認し、偽陽性を分ける。
4. D026によりOwner手動の出典付き事実は自動取得allowlist外でもあり得る。入力経路を確認し、URL存在と内容の真実性は分ける。
5. 字数はlib/llm/content-length.ts、モデルはlib/llm/models.tsを実読する。密度は根拠の異なる事実、同じ根拠の反復、観測と解釈の対応で示す。数字や固有名詞を増やすだけの提案をしない。
6. サンプル監査は大会・期間・入力量で層別し、選定方法と件数を明記する。全件機械監査は読取でもLLM費用がある場合は見積と既存のOwner承認範囲を確認し、未承認で実行しない。

出力は本文箇所・根拠・判定（確認済み/不一致/不足）・影響URL・修正候補。即時regenやunpublishを実行せず、対象一覧をOwnerへ渡す。復旧準備はcontent-regen、根本修正はspec-writingへ。
