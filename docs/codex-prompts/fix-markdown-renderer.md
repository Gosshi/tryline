# Codex プロンプト: fix-markdown-renderer（γ案：プロンプト制約追加）

以下の内容をそのまま Codex にコピペして使用します。

---

タスク: LLM プロンプトに「強調記号を使わない」制約を追加し、自前パーサーの除去挙動と整合させる

## 背景

`components/match-content.tsx` は現在カスタム Markdown パーサーを使用しており、`**bold**` / `*italic*` の記号を除去する（テキスト自体は残る）。`react-markdown` は npm レジストリへのアクセス制約のため導入不可。Phase 1 は LLM に強調記号を使わせない指示を追加することで対応する。

## 影響を受けるファイル

- `lib/llm/prompts/generate-preview.ts`
- `lib/llm/prompts/generate-recap.ts`
- `lib/llm/prompts/extract-tactical-points.ts`（`detail` に強調記号が混入するケースの対策）

## 制約

- `PROMPT_VERSION` を semver インクリメントする（例: `preview@1.0.0` → `preview@1.1.0`）
- プロンプト本文の追加は 1 行のみ。既存の構成・文字数指示は変えない
- `components/match-content.tsx` は変更しない

## 要件

各プロンプトの「出力は日本語マークダウン本文のみ。」の行の直後に以下を追加する:

```
"強調記号（**、*、__、_）・コードブロック（```）・引用（>）は使用禁止。見出し(#)と箇条書き(-)のみ使用すること。",
```

`extract-tactical-points.ts` の `detail` フィールドについては、既存の「一般論は禁止」行の直後に以下を追加する:

```
"detail に強調記号（**、*）を使わないこと。",
```

## 受け入れ条件

- [ ] `generate-preview.ts` / `generate-recap.ts` / `extract-tactical-points.ts` の 3 ファイルが更新されている
- [ ] 各ファイルの `PROMPT_VERSION` がインクリメントされている
- [ ] 追加行が既存のプロンプト配列に正しく挿入されている（`.filter(Boolean).join("\n\n")` チェーンが壊れていない）
- [ ] `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン

## 完了時に必ず報告すること

- 変更した 3 ファイルの差分サマリー
- 新しい `PROMPT_VERSION` の値
- `pnpm test` の実行結果

## やってはいけないこと

- `components/match-content.tsx` の変更
- `react-markdown` / `remark-gfm` のインストール試行
- プロンプトの構成・文字数指示の変更
- `CLAUDE.md` / `/specs/*.md` / `/docs/decisions.md` の書き換え
