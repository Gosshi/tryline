---
name: content-regen
description: 再生成の運用準備。「regen」「再生成」「backfill」と言われたら起動。対象・費用・入力整合・停止条件を具体化し、承認範囲の段階実行を支援する。
---

# content-regen

共通参照: [運用方針と測定基準](../today/references/operating-baseline.md)。

lib/llm/content-length.tsとmodels.ts/pricing.ts、該当spec、最新QA/保存仕様を確認する。実装コードは書かない。
1. 対象match_id/content_type/language、現在の公開状態・本文hash・入力hash・再実行理由をmanifestにする。現在データの汚染は先にproduction-data-integrityで確認し、汚染した入力のまま再生成しない。
2. キャッシュ/force、モデルと最大試行回数、対象件数、最悪費用、成功/停止条件を提示する。Ownerが既に具体的対象と費用を承認していれば再質問しない。承認を超える追加範囲だけを別に扱う。
3. 既存の小数試行（3〜6件、現行SKILL.mdの段階実行規則を2026-09-05確認）で根拠、QA、字数、保存状態を検品する。失敗・公開件数の予期しない減少・費用超過・入力不整合で止める。
4. 既存仕様に従って通常の再生成reject時は公開版を保持する。一方、既存公開版に誤情報が確認されたときの隔離はOwnerが対象ごとに判断する。保持されたから品質合格とはしない。
5. 正常件数だけでなくpublished/draft/preserved/skipped/failedの理由と対象IDを残す。続行前に失敗を解消し、安易な全件再実行をしない。

本番データ操作はCLAUDE.mdの境界を守る。Claude CodeのUPDATEは具体的対象/条件に対するOwner承認がある場合だけ。INSERT/DELETE/DDLをClaude Code自身が実行せず、Codexへの依頼も本番操作権限の付与とはみなさない。env/ignoredファイルを読む本番コマンドはOwner本人の実行に渡し、秘密値を要求しない。
出力は実行可能な対象一覧・コスト・段階手順・結果照合表。再生成APIの実行を今回の監査依頼から推測しない。
