# Codex Prompt: デザイントークン導入（フォント・カラー・背景）

## 背景

UI 監査で「素の HTML に Tailwind を当てただけ」に見える主因として、カスタムフォントが一切なく H1 も得点数字も同じシステムフォントスタックで描画されている点が指摘された。本プロンプトでフォントと基本カラートークンを整備する。コンポーネント個別のスタイル変更は次のプロンプトで行う。

---

## 変更対象ファイル

- `app/layout.tsx`
- `app/globals.css`
- `tailwind.config.ts`

---

## Task 1 — `app/layout.tsx` でフォントを読み込む

`next/font/google` を使って 2 書体を読み込み、CSS 変数として注入する。

```typescript
import { Fraunces, Noto_Serif_JP } from "next/font/google";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz"],
  weight: ["300", "600", "700"],
  display: "swap",
});

const notoSerifJP = Noto_Serif_JP({
  subsets: ["latin"],
  variable: "--font-noto-serif-jp",
  weight: ["700"],
  display: "swap",
});
```

`<html>` タグにクラスを追加する:

```tsx
<html lang="ja" className={`${fraunces.variable} ${notoSerifJP.variable}`}>
```

---

## Task 2 — `tailwind.config.ts` にフォントファミリーを追加

`theme.extend` の末尾に追加する（既存の `borderRadius`, `colors` は変更しない）:

```typescript
fontFamily: {
  display: ["var(--font-fraunces)", "Georgia", "serif"],
  serif: [
    "var(--font-noto-serif-jp)",
    "var(--font-fraunces)",
    "Georgia",
    "serif",
  ],
},
```

---

## Task 3 — `app/globals.css` を更新

### body スタイルを変更

背景を slate-50 から温かみのある off-white に変更する。既存の `font-family` 宣言は上書きする。

```css
body {
  background-color: oklch(98.5% 0.005 95);
  color: oklch(18% 0.02 260);
  font-family:
    "Hiragino Sans",
    "Noto Sans JP",
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}
```

### 見出しに serif フォントを適用

```css
h1,
h2,
h3 {
  font-family:
    var(--font-noto-serif-jp),
    var(--font-fraunces),
    "Hiragino Mincho ProN",
    Georgia,
    serif;
}
```

### `:root` に Tryline デザイントークンを追記

既存の shadcn variables（`--background`, `--foreground` 等）は削除せず、末尾に追記する:

```css
/* Tryline design tokens */
--color-paper: oklch(98.5% 0.005 95);
--color-ink: oklch(18% 0.02 260);
--color-ink-muted: oklch(45% 0.02 260);
--color-rule: oklch(90% 0.01 260);
--color-accent: oklch(58% 0.18 145);
```

---

## 完了条件

- [ ] ページの見出し（h1, h2, h3）が Noto Serif JP で描画される
- [ ] ページ背景が以前の slate-50 より温かみのある off-white になっている
- [ ] `font-display` と `font-serif` Tailwind クラスが利用可能
- [ ] 既存の shadcn CSS variables が残っている
- [ ] `pnpm tsc --noEmit` がパスする
- [ ] `pnpm build` が成功する

## 変更しないこと

- `components/` 以下のファイル
- shadcn の既存 CSS variables（`--background`, `--primary` 等）
- Tailwind の既存 `theme.extend` の内容（`borderRadius`, `colors` 等）
