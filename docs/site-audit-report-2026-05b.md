# Tryline サイト再評価レポート（2026年5月b）

## 調査日: 2026-05-09

## サマリー

前回（2026年5月a）レポートからの期間で、トップページに「今後の試合（JST 表示）」「最近のレビュー」の導線が追加され、試合詳細ページには「点差の推移グラフ」「YouTubeでハイライトを検索」ボタン、Premium ペイウォールが実装された。大会ハブには写真バナーが追加され、全体的なビジュアルクオリティが上がった。一方、URC 2025-26 は試合データが未取込みで空状態のまま、全大会ハブが同一の Unsplash 写真を共用しており大会個性が出ていない。SRP の試合詳細は Six Nations 比でデータ密度が低い（点差グラフなし）。P0 相当の致命的な問題はない。

---

## スクリーンショット一覧

Playwright MCP で撮影。デスクトップ 1440×900、モバイル 375×812。

- `docs/site-audit-screenshots/2026-05b/top-desktop.png`
- `docs/site-audit-screenshots/2026-05b/top-mobile.png`
- `docs/site-audit-screenshots/2026-05b/srp-hub-desktop.png`
- `docs/site-audit-screenshots/2026-05b/srp-2026-desktop.png`
- `docs/site-audit-screenshots/2026-05b/six-nations-hub-desktop.png`
- `docs/site-audit-screenshots/2026-05b/six-nations-2025-desktop.png`
- `docs/site-audit-screenshots/2026-05b/urc-hub-desktop.png`
- `docs/site-audit-screenshots/2026-05b/urc-2025-26-desktop.png`
- `docs/site-audit-screenshots/2026-05b/match-srp-desktop.png`
- `docs/site-audit-screenshots/2026-05b/match-srp-mobile.png`
- `docs/site-audit-screenshots/2026-05b/match-sixnations-desktop.png`

---

## 直近修正の反映確認

### 1. ヒーロー背景写真の opacity（commit `7997047`）

- **状態: ✅ 反映済み**
- `opacity: 0.25`（JS `getComputedStyle` で確認）
- 写真 URL: `photo-1763854413165-1713bc5a7f4a`（Unsplash、ラグビー試合写真）
- **評価**: テクスチャとしては機能しているが、`var(--color-ink)` の暗い背景 + 0.25 opacity の組み合わせでは写真としての視認性は弱い。意図的な「ダーク UI」として成立している範囲内ではあるが、0.35〜0.40 に上げると写真の臨場感が増す可能性がある。

### 2. SRP 2026 recap バックログ消化

- **状態: ✅ 反映済み**
- トップページの「最近のレビュー」セクションに SRP 2026 のレビューが複数表示
- SRP Round 1 の試合詳細（Fijian Drua vs Moana Pasifika）でも日本語レビューを確認
- トップページの「最新シーズン」も Super Rugby Pacific 2026 を指している

### 3. URC 2025-26 試合データ取込み

- **状態: ❌ 未取込み**
- `/c/urc/2025-26` は「試合が登録されていません」の空状態のみ
- シーズン自体は DB に登録されている（ハブページに "2025-26" が表示される）
- データ取込みは Owner によるスクリプト実行が必要（Codex タスクなし）

---

## 改善点（前回比）

| 項目 | 状況 |
|------|------|
| トップページ「今後の試合（JST）」 | ✅ 実装済み |
| トップページ「最近のレビュー」 | ✅ 実装済み |
| 大会ハブの写真バナー | ✅ 実装済み |
| 試合詳細「点差の推移グラフ」 | ✅ Six Nations で実装済み（SRP は match_events データ次第） |
| 試合詳細「YouTubeでハイライトを検索」ボタン | ✅ 全試合詳細で実装済み |
| Premium ペイウォール（¥980/月） | ✅ 実装済み |
| 出場選手リスト（2列レイアウト） | ✅ Six Nations で確認 |

---

## 残存課題と優先順位

### P0（致命的・即対応）

なし。全主要ページが正常に表示される。

---

### P1（1週間以内）

#### P1-1: 全大会ハブが同一写真を共用

- **問題**: Six Nations、Super Rugby Pacific、URC のハブページがすべて同じ Unsplash 写真（La Région Occitanie スタジアム）を表示している
- **影響**: 大会ごとの個性・臨場感がなく、コピー感が強い。Six Nations のページで南半球の写真が出るのも不自然
- **対応**: → `docs/codex-prompts/pr20-competition-hero-per-slug.md`

#### P1-2: URC 2025-26 空状態の UX が弱い

- **問題**: 「試合が登録されていません」の一文のみ。なぜ空か、次にどこへ行けばいいかが不明
- **影響**: URC を目当てに来たユーザーが迷子になり離脱しやすい
- **対応**: → `docs/codex-prompts/pr21-empty-state-contextual.md`

#### P1-3: URC 2025-26 試合データ取込み（Owner 作業）

- **問題**: シーズンは登録済みだが試合データが 0 件
- **対応**: Owner が既存の取込みスクリプトを URC 2025-26 向けに実行する（Codex 作業なし）

---

### P2（1ヶ月以内）

#### P2-1: モバイル試合カードのチーム名切れ

- **問題**: "Moana Pa..."、"D..." など長いチーム名がモバイルでトランケートされる
- **影響**: チームが特定しにくい（フラグと略称はある）
- **対応**: モバイル用のチーム名略称ロジック改善または 2 行許容

#### P2-2: SRP 試合詳細の点差グラフ不在

- **問題**: SRP Round 1 試合では `match_events` データがなく、得点グラフが表示されない。Six Nations との情報密度差が大きい
- **影響**: SRP ユーザーが詳細データを得られず体験が非対称
- **対応**: `pr14-data-gap-fill.md`（データ欠損補完）の優先実行を確認

#### P2-3: トップページヒーロー写真の視認性

- **問題**: opacity 0.25 + `var(--color-ink)` 背景で写真としての存在感が弱い
- **対応**: opacity を 0.35〜0.40 に上げるか、背景色をやや薄くして写真の輪郭が伝わるように調整

#### P2-4: プレビューなし + レビューあり試合の表示状態未確認

- **問題**: `pr1-fix-preview-section-visibility.md` が作成済みだが、目視で該当ケースを確認できていない
- **対応**: `status = 'finished'` で `preview_content IS NULL AND review_content IS NOT NULL` の試合を検索し、実際の表示を確認

---

### P3（長期）

- モバイル長文レビューの目次・セクションジャンプ（`pr4-feat-review-toc.md` 実装確認）
- 大会別の写真を Wikimedia Commons / 公式ライセンス画像に移行（現在は Unsplash で代替）
- 試合前 48 時間・試合後 1 時間のコンテンツ公開リズムの明示
- 選手ページ・チームページへの導線強化（`pr13-team-pages.md` 参照）

---

## 前回指摘からの対応状況まとめ

| 前回指摘 | 状況 |
|---------|------|
| トップページに「レビュー公開済み」導線がない | ✅ 解決（最近のレビューセクション） |
| トップページに「次の試合」導線がない | ✅ 解決（今後の試合セクション） |
| グローバルナビ `順位表` が `/#standings` 固定 | ⚠️ 未確認（ナビ構造変更要確認） |
| 空状態の説明が薄い | ⚠️ 部分的（URC 2025-26 で依然として問題） |
| LLM レビューが一般表現に偏る | ⚠️ 継続課題（内容の質は改善の余地あり） |
| プレビュー未公開 + レビューのみ試合の表示 | ⚠️ 未目視確認（pr1 は作成済み） |
| モバイルの長文レビューにジャンプ機能がない | ⚠️ 未確認（pr4 の実装状況要確認） |
| 写真・チームエンブレム・動画がない | ⚠️ 写真バナーは追加。エンブレム・動画は長期課題 |
