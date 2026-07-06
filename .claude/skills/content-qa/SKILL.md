---
name: content-qa
description: 公開済みコンテンツ（recap/preview）の品質を監査するときに使う。「コンテンツ品質を見て」「recap の質を監査」「捏造チェック」「密度どうなってる」と言われたら起動。過去に実際に起きた品質問題の観点集と調査手順。
---

# コンテンツ品質監査（recap / preview）

公開済み LLM コンテンツの品質を定期監査する。DB アクセスは `prod-investigation` スキルの読み取り専用ルールに従う。

## 監査観点（すべて過去に実際に起きた問題）

| 観点 | 何を見るか | 過去の事例 |
|------|-----------|-----------|
| 統計捏造 | sourced facts に無い数値・固有名詞（成功率%・ポゼッション等） | 捏造 live 統計（#344 でガード実装済み）。旧 preview 約20件に残存疑い |
| **人名捏造（グラウンディング）** | 確定ラインアップ・イベント・sourced facts に無い選手名を断定的役割付きで記載。**データを隠しても LLM の事前学習知識（parametric knowledge）から実在有名選手を持ち出すため、hasLineups=false だけでは防げない** | 2026-07-04 Nations Championship 開幕日、日本含む6試合全てで実在選手（デュポン・モウンガ・サヴェア等）の断定的捏造。`specs/feat-entity-grounding-gate.md`（PR #467）で決定的ゲート実装、`tools/audit-entity-grounding.ts` で公開済み全件監査可能に |
| イベント汚染 | 別試合の match_events を参照した recap | Autumn 31試合+SRP 6試合が同一イベント共有（fix-contaminated-match-events） |
| 密度後退 | recap density（具体的事実の出現率）の月次推移 | 2026-06 に 3.72→2.96 へ後退（PMF監査） |
| 冒頭の紋切り型 | 冒頭表現の多様性（「得点力」開始が37%だった事例） | fix-recap-opening-variety で対応済み。再発監視 |
| 見出し崩れ | 「セクションN:」「（字数）」等のラベル露出 | fix-recap-heading-format / fix-preview-section-headings |
| 字数不足 | QA 最低字数（recap 2,000字）との整合 | 297件 draft 化事故（プロンプト字数予算と QA 基準の矛盾） |
| MOM 不整合 | MOM が公式発表と食い違う（LLM 推論のため） | 決勝で手修正した事例（project_mom_data_gap） |

## 手順

1. **人名捏造は全件機械監査が可能**（他の観点と違いサンプリング不要）: `node --env-file=.env.production.local tools/run-ts.cjs tools/audit-entity-grounding.ts --confirm-owner-approved`。公開済み全件（899件時点で$0.45〜$0.90）を照合し `tmp/entity-audit/entity-grounding-audit-*.json` にレポート出力
   - 結果は `allowedEntityCount` で層別すること: **0件＝ほぼ確実に本物の捏造**（最優先で確認）。**1件以上＝実データはある状態での違反**で、チーム名・大会名の誤検出（照合精度の偽陽性）や、事件性の低い言及の可能性も高いため個別に本文を読んで判断する
   - 違反（特に allowedEntityCount=0）が見つかった記事は、`content-regen` の draft戻し手順で即座に unpublish し、原因を確認してから再生成する
   - **手動で match_events と突き合わせる場合の必須注意（2026-07-05 の誤検知事故から）**: 得点者名の真実は `match_events.metadata->>'player_name'` にある。`player_id` は players テーブルへのリンク解決結果にすぎず、**`player_id IS NULL` は「得点者不明」を意味しない**（リンク未解決でも metadata に名前は入っている）。assemble・許可リスト・プロンプトはすべて metadata 側を使う。player_id だけを見て「LLM が名前を補完した」と断定すると、正確な記事を捏造と誤判定する
2. **他の観点はサンプリング**: 直近公開分から大会横断で 10〜20件抽出（1大会に偏らせない）
3. **機械チェック**: 字数・見出し形式・禁止パターン（「セクション」「自動生成」等）を grep 相当で
4. **目視チェック**: 冒頭多様性・密度は本文を読んで判定
5. **基準との比較**: `docs/pmf-audit-2026-06-10.md` の density 測定方法を踏襲し、時系列で比較可能にする

## 問題を見つけたら

- **即座に再生成しない**。件数と影響範囲を確定 → 原因（プロンプト/データ/QA ゲート）を特定 → `spec-writing` で修正 spec → 修正後に `content-regen` の試し焼きルールで直す
- 一括再生成は 297件 draft 化事故の再来リスク。**必ず少件数の試し焼き→検品→段階実行**

## 出力

観点別の合否表＋悪い実例（match_id 付き）＋spec 化候補。数値は「実測値＋対象期間＋サンプル数」を明記。
