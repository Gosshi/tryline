# Codex プロンプト: 日本語見出しフォントの修正

## 仕様書

`specs/fix-japanese-heading-font.md` を読んで実装してください。

## 概要

`font-serif` / `font-heading` が Latin-only の Oswald にエイリアスされているため、サイト内のほぼ全ての日本語見出しが端末任せのシステムフォントで描画されています。Noto Serif JP を next/font で追加し、見出し系のフォントスタックを日本語セリフに差し替えます。**className の変更は一切不要**で、変更は3ファイルのみです。

## 対象ファイル（計3ファイル）

1. `app/layout.tsx` — `Noto_Serif_JP` を追加ロード（`variable: "--font-serif-jp"`, weight 600/700, `display: "swap"`, `preload: false`）し、`<html>` の className に variable を追加
2. `tailwind.config.ts` — `fontFamily` を変更:
   - `serif` / `heading` → `["var(--font-serif-jp)", "Hiragino Mincho ProN", "Yu Mincho", "serif"]`
   - `display` → `["var(--font-heading)", "sans-serif"]`（Oswald のまま）
   - `body` → 変更なし
3. `app/globals.css` — base レイヤーの `h1, h2, h3 { font-family: var(--font-heading) }` を serif-jp スタックに差し替え

## 変更しないファイル（触らない）

- 各ページ・コンポーネントの `font-serif` / `font-heading` / `font-display` クラス指定（そのまま新マッピングを受ける）
- `components/standings-table.tsx` / `components/round-heading.tsx`（`font-display` のまま Oswald 維持が正）
- Oswald・Noto Sans JP のロード自体（削除しない）

## 確認方法

```bash
pnpm tsc --noEmit && pnpm lint && pnpm build
```

ローカルで `pnpm dev` を起動し、Playwright で:

1. `/`（375px と 1440px）— ヒーロー h1「海外ラグビーを、日本語で深掘り。」がセリフ体で描画されること（`getComputedStyle` の font-family 先頭が `--font-serif-jp` 由来、`document.fonts.check('700 32px "Noto Serif JP"')` が true）
2. `/pricing`・試合詳細ページ — 日本語見出しがセリフ体、順位表の数字が Oswald のまま
3. 見出しの折返し・行間の崩れがないことをスクリーンショットで目視確認（セリフはグリフ幅が広い）

## 完了条件

- 上記の確認がすべて通る
- 日本語テキストを含む h1〜h3 に Oswald が適用されている箇所が0件
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- **PR の base は必ず main にすること**
