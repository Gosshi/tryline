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
- **index bloat が第一ボトルネック**: GSC 登録済の大半が薄い選手ページ。spec: `specs/fix-index-bloat-players-teams.md`
- **日本語クエリ流入ゼロの根因は英語名**: チーム・大会名のカタカナ化。spec: `specs/feat-japanese-team-competition-names.md`
- **チャネル戦略**: SEO（B案）+ X 運用（@tryline_rugbyjp、毎日 10 分の reply 運用）。note・海外向け英語化はやらない
- 過去の監査レポート: `docs/growth-audit-2026-07-01.md`、`docs/growth-playbook-2026-06.md`

## 出力

数値は必ず「実測値 + 期間」を明記。改善提案は spec 化候補として挙げ、Owner の判断に委ねる（勝手に spec を作らない）。
