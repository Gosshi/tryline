# Codex プロンプト: fix-markdown-renderer

以下の内容をそのまま Codex にコピペして使用します。

---

タスク: `components/match-content.tsx` の自前 Markdown パーサーを `react-markdown` + `remark-gfm` に置き換える

## 背景

PR #22 で `react-markdown` + `remark-gfm` が CI の依存解決失敗で削除され、自前の正規表現パーサーに差し替えられた（コミット `98ccf5b`）。現在のパーサーは `**bold**` / `*italic*` / 順序付きリスト / 引用 / コードブロックを未サポートで、一致文字列を無差別に除去する。LLM が生成する日本語コンテンツの表現が制限されている。

## 影響を受けるファイル

- `components/match-content.tsx` — 自前パーサーを削除し `react-markdown` に差し替える
- `package.json` — `react-markdown` / `remark-gfm` を追加
- `tests/components/match-content.test.tsx` — レンダリング方式の変更に追随して更新

## 制約

- `rehype-raw` は使用禁止（XSS 防止。`p1-match-content-display.md` の設計要件）
- `formatGeneratedAtJst` 関数と更新日時表示（`<time>` 要素）は維持する
- `react-markdown` のデフォルトレンダラーを使用する。カスタムコンポーネントの追加は最小限に留める
- Tailwind のスタイルは現在の `match-content.tsx` に適用されている クラス名（`text-lg font-semibold`、`list-disc pl-6` 等）を `components` prop で引き継ぐ

## 実装前のアクション

1. `react-markdown` の最新バージョンを確認し、React 19 / Next.js 15 との peer dep 互換性を確認する
2. 互換性がある場合は通常インストール。peer dep 警告が出る場合は `--legacy-peer-deps` を試す。それでも解決しない場合は実装を中止して Owner に報告する
3. `remark-gfm` のバージョンも同様に確認する

## 受け入れ条件

- [ ] `react-markdown` + `remark-gfm` が `package.json` の `dependencies` に追加されている
- [ ] `components/match-content.tsx` の `parseMarkdown` / `parseInline` / `renderBlock` / `renderInline` 関数が削除されている
- [ ] `**太字**` / `*イタリック*` が正しくレンダリングされる
- [ ] `- 箇条書き` が `<ul>` でレンダリングされる
- [ ] `1. 順序付きリスト` が `<ol>` でレンダリングされる
- [ ] `# 見出し` / `## 見出し` が適切な `<h3>` / `<h4>` タグでレンダリングされる（既存の Tailwind クラスを維持）
- [ ] `<script>` タグが実行可能な DOM に挿入されない（`rehype-raw` 不使用）
- [ ] `formatGeneratedAtJst` と更新日時表示が維持されている
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン
- [ ] 既存テスト `tests/components/match-content.test.tsx` が更新され全て通過する

## 完了時に必ず報告すること

- インストールした `react-markdown` / `remark-gfm` のバージョン
- peer dep 解決の方法（通常インストール / `--legacy-peer-deps` 等）
- 削除したコード量（行数）
- `pnpm lint` / `pnpm typecheck` / `pnpm test` の実行結果

## やってはいけないこと

- `rehype-raw` の追加（XSS 防止のため禁止）
- `components/match-content.tsx` 以外のコンポーネントの変更
- `formatGeneratedAtJst` の削除
- カスタム remark/rehype プラグインの追加（`remark-gfm` のみ）
- `CLAUDE.md` / `/specs/*.md` / `/docs/decisions.md` の書き換え
