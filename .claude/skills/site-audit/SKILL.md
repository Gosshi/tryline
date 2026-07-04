---
name: site-audit
description: 本番サイトの実測監査（スクリーンショット・UI/UX・SEO 評価）をするときに使う。「サイトをレビューして」「本番を確認して」「スクショ撮って評価」と言われたら起動。撮影規約と誤検出への注意。
---

# 本番サイト監査

Playwright MCP で https://www.trylinerugby.com を実測し、デザイン・UI・SEO を評価する。読み取り専用（本番への書き込み・ログイン試行はしない）。

## 撮影規約

- viewport: desktop 1440x900 / mobile 375x812
- `browser_take_screenshot` で fullPage、JPEG 品質90
- 保存先: `docs/site-audit-screenshots/YYYY-MM/`（過去監査と同じ規約。リポジトリルートに置き去りにしない）
- レポートは `docs/` に `<テーマ>-YYYY-MM-DD.md` で保存（例: `design-ui-growth-review-2026-07-03.md`）

## 誤検出への注意（実際にやらかした3パターン）

フルページスクリーンショットは**キャプチャ時点の初期描画**しか写さない。以下は「壊れている」と断定する前に必ずソース確認:

1. **lazy-load 画像の空白**: below-fold の画像は未ロードで空白に写る。`browser_evaluate` で `naturalWidth`/HTTP ステータスを確認
2. **ハイドレーション後にしか出ない UI**: ペイウォール CTA・チャット枠などクライアント描画の要素は初期 HTML に無い。`document.body.textContent` を遅延後に評価して確認
3. **自動展開アコーディオン**: `useEffect` でデフォルト展開＋自動スクロールする実装は、スクショだと「全部閉じている」ように見える。該当コンポーネントのソース（useState 初期値・useEffect）を読む

詳細はメモリ `feedback_screenshot_audit_caveat` 参照。

## SEO 判定はサーバー HTML で

a11y スナップショットやスクショで「リンクが無い」と判定しない。クローラが見るのはサーバー HTML:

```js
// browser_evaluate で
const html = await (await fetch('/対象パス')).text();
(html.match(/href="\/matches\//g) || []).length
```

## UI 変更を提案する前に

「隠す・折りたたむ・簡略化する」系の提案は、**過去に採用→撤回された前例がないか** `git log --oneline -- <対象ファイル>` で確認する（メモリ `feedback_spec_history_check` 参照。docs/decisions.md に載っていない判断がコミット履歴だけに残っていることがある）。

## 過去の監査レポート

- `docs/design-ui-growth-review-2026-07-03.md`（デザイン・UI・集客横断）
- `docs/site-audit-report-2026-05.md` / `-2026-05b.md`
- 比較の基準として先に読み、重複調査を避ける
