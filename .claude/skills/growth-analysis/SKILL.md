---
name: growth-analysis
description: SEO・集客・グロースの分析をするときに使う。「GSC を見て」「アクセス状況は」「SEO 分析して」「グロース監査」と言われたら起動。GSC/GA4 の取得手順と既知の診断コンテキスト。
---

# グロース分析（GSC / GA4）

## データ取得

### GSC（Search Console）

```bash
node --env-file=.env.production.local tools/run-ts.cjs tools/gsc-pull.ts
```

- 出力は `tmp/gsc/` に落ちる → Read で読んで分析する
- セットアップ手順は `docs/runbooks/gsc-analysis-setup.md`（URL-prefix プロパティ、SA は読み取り専用）
- Search Analytics + URL Inspection が取れる

### GA4

- MCP ツール `mcp__analytics__run_report` を使う（ToolSearch で先にロード）
- 期間比較は前週・前月同期間で行う

## 分析時に前提とする既知の診断（2026-07 時点）

- **実測はゼロ近傍**: GA4 で約 4.1 セッション/日。小さい変動を「成長」と誤読しない
- **技術衛生はほぼ完了**: index bloat（選手ページ noindex 済み・GSC 在庫は自然消化を監視のみ）、カタカナ命名、title/meta、IndexNow はすべて対策済み。再提案しない
- **チャネル戦略**: SEO（大会ハブ集中）+ X 運用（毎日10分 reply + データ画像）+ note（週次まとめ + 月1エバーグリーン。note 8 > X 3 セッション/28日で唯一機能している referral）。海外リーグの英語化はやらない
- **GSC で需要実証済みの領域は大会ページのみ**: PNC 2026 順位10位・クリック発生、RWC 系クエリ29〜58位（→ `rwc2027` スキル）。選手ページ・英語名クエリは在庫消化中で追わない
- 過去の監査レポート: `docs/marketing-strategy-2026-07-06.md`（**現行戦略。90日 KPI 表は §9**）、`docs/growth-audit-2026-07-01.md`、`docs/growth-playbook-2026-06.md`

## 出力

数値は必ず「実測値 + 期間」を明記。改善提案は spec 化候補として挙げ、Owner の判断に委ねる（勝手に spec を作らない）。
