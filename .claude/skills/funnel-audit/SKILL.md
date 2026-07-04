---
name: funnel-audit
description: サイト内の動線・CVR（訪問→サンプル→トライアル→課金）を監査・改善検討するときに使う。「動線を見て」「CVR 改善」「ファネル分析」「トライアルが増えない」と言われたら起動。ファネル定義と計測箇所の地図。
---

# 動線・CVR 監査

訪問者が課金に至るまでのサイト内動線を監査する。流入（集客）側は `growth-analysis`、サイトの見た目は `site-audit` が担当。このスキルは**ファネルの段差**を見る。

## ファネル定義と計測箇所

| 段 | 遷移 | 計測 |
|----|------|------|
| 1 | 流入 → LP（ホーム/試合/大会ページ） | GA4 `landingPagePlusQueryString`。外部配信の流入分離は UTM（`specs/feat-utm-attribution.md`） |
| 2 | LP → サンプル recap 閲覧 | `TrackedLink` の CTA クリックイベント（`lib/analytics.ts`）。`cta_id` 例: `home_hero_sample_recap` |
| 3 | サンプル → pricing 到達 | `cta_id: home_hero_pricing` 等 + GA4 ページビュー `/pricing` |
| 4 | pricing → トライアル開始 | Stripe Checkout 遷移、`checkout-success-tracker.tsx` が成功時イベント送信 |
| 5 | トライアル → 課金継続 | Stripe ダッシュボード（Owner 確認。テストキーのみ扱う） |

計測の既知ギャップ: `docs/measurement-plan-2026-06.md`（GAP-1 = UTM 未付与、実装状況は spec 確認）。

## 監査手順

1. **GA4 で段ごとの実数を取る**（`mcp__analytics__run_report`、property 538067713）: ページ別 PV、イベント（CTA クリック名）、`/pricing` 到達数
2. **動線を実際に歩く**: 未ログイン状態で 流入LP→サンプル→pricing→（Checkout 直前まで）を Playwright で辿り、各段の CTA の見つけやすさを確認。**Checkout の送信・決済はしない**
3. **段差（ドロップ）を特定**: 母数が小さい間（数十セッション/月）は率でなく「その段の導線が存在するか・見えるか」の定性チェックを優先
4. **既知の動線課題と照合**: ペイウォール CTA がクライアント描画のみ（`specs/fix-paywall-server-side-gating.md`）、pricing サンプル画像の重さ等（`docs/design-ui-growth-review-2026-07-03.md` F 章の対応表）

## 改善提案の作法

- 各提案を「どの段の、どの離脱要因に効くか」で必ずタグ付け（認知/信頼/回遊/CVR）
- 実装は spec 化して Codex へ（`spec-writing` スキル）。CTA 文言だけの変更でも `TrackedLink` の `cta_id` を維持するか明記（計測の連続性）
- 母数ゼロ近傍で A/B テストは提案しない（統計的に無意味）。まず絶対数を増やす施策との優先順位を `biz-strategy` の I×E で整理

## 制約

- Stripe は本番キー（`sk_live_`）を一切扱わない。決済フローの確認はテストモードか目視まで
- 本番 DB・GA4 への書き込みはしない
