---
name: codex-review
description: 実装差分のレビュー。「実装したので確認」「PRをレビュー」「ローカル差分を見て」と言われたら起動。現行仕様・動作証拠・実行されたテストを照合する。
---

# codex-review

共通参照: [運用方針と測定基準](../today/references/operating-baseline.md)。

コードを修正せず指摘を返す。マージは別依頼がある場合のみpr-mergeへ。
1. git statusと対象base/head SHAを確認し、未関係差分を巻き込まない。PRはdiffと変更ファイル、ローカルは未ステージ/ステージ済みを区別する。
2. 対応specとpromptを全文読み、decisions/後続spec/履歴で現在性を確認する。受け入れ条件を番号ごとに証拠へ対応づける。
3. 不一致入力、DB errorの戻り値、例外、対象0件、キャッシュ、runの部分失敗を追う。HTTP200やActions success、pipelineのstage successだけで全体成功を判定しない。
4. match_id/cache単位の例外を各仕様に照らし、grounding/allowlist/robots/生テキスト非再配信を維持する。D026例外を本文取得へ拡張していないか確認する。
5. 標準pnpm testに含まれるテストと除外テストをvitest.config.tsで確認する。仕様指定の検証結果を優先し、未実行をgreenと書かない。表示変更は実画像/DOM/SSRも確認する。
6. モデルはlib/llm/models.ts、コストと最大試行数は現行実装で確認する。プロンプト変更のversion/cache更新は対応specに従う。未承認のLLMや本番書込みをレビュー中に実行しない。

出力はAC番号/合否/根拠/未検証、重大度付き指摘（path:line、再現、影響、修正方向）、Codexへ渡す具体文。レビュー合格とマージ実行許可を混同しない。
