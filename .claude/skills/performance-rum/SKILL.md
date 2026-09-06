---
name: performance-rum
description: 実ユーザー性能の監査。「CWVを見て」「遅い原因」「実ユーザーのパフォーマンス」と言われたら起動。RUMとラボ測定を分けて評価する。
---

# performance-rum

共通参照: [運用方針と測定基準](../today/references/operating-baseline.md)。

現状の取得済みRUM/CrUX/認可済み分析データを読み取る。新しいSDKや収集イベントはspecなしに追加しない。
1. 対象URL群、期間、端末/OS/ブラウザ、地域、ログイン状態、release、サンプル件数を記録する。Windows読者構成を含む数値はgrowth-analysisの出典付き集計を使う。
2. LCP/INP/CLSを指標ごとにp75、母数、期間、ページ種別で示す。基準は取得時点の公式資料を確認する。参照: https://web.dev/articles/defining-core-web-vitals-thresholds （2026-09-05確認）。データ不足は未判定とする。
3. CrUXのorigin値とURL値、RUMの計測条件、ラボの単回測定を混ぜない。Lighthouseが良いだけで実ユーザーも良いとしない。観測のない指標を0扱いしない。
4. 原因調査は画像/フォント/JS、hydration、キャッシュ、API応答、操作遅延を対象にし、再現条件・ネットワーク・viewportを揃える。Ownerセッションと一般読者の偏りを明記する。
5. RUM未導入なら必要イベント/保持期間/同意/匿名化/費用/サンプリングを仕様候補にする。URLクエリのtoken、個人情報、入力値を収集しない。

出力は測定条件、指標別結果、根拠のある原因候補、未検証、修正前後の比較計画。測定ツールを導入するだけで改善完了としない。画面のはみ出しはsite-auditへ。
