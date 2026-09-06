---
name: content-plan
description: サイト内記事の企画。「どんなコンテンツを足す」「常設ページ企画」「大会ガイド企画」と言われたら起動。需要と使用可能な根拠を先に確認する。
---

# content-plan

共通参照: [運用方針と測定基準](../today/references/operating-baseline.md)。

サイト内の資産を担当し、noteはnote-weekly、Xはx-postへ分ける。
1. BWT/GSCの実クエリ、サイト内行動、読者の具体的課題から始める。検索需要なしなら仮説と明記する。「唯一需要がある」等の古い断定を使わない。
2. 現行のroutes/DB型/仕様を確認し、既存コンテンツの重複を避ける。competition_guidesはfamily/guide_jaを持つテーブルであり、competitionsのguide列と決めつけない。
3. 試合URL数、公開記事数、言語別記事数を別に数える。利用するスコア・イベント・参加国が検証済みかcontent-qa/production-data-integrityで確認する。
4. 企画ごとに問い、対象読者、使う根拠、更新担当/周期、検索意図、CTA、Owner工数、維持費、検証方法を示す。新規収集は許可・robots・カバレッジ・費用を先に確認する。
5. D017のB停止/C保留とD019のX役割を守る。サイトへの移設・新しいpilot範囲・収集投資はOwnerが決める。

出力は企画案と根拠不足の一覧。合意後はspec-writing→Codexへ渡す。本文の公開やデータ書込みを行わない。
