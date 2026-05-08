# frontend-typography-system: タイポグラフィシステムの導入

## 背景

サイト評価でタイポグラフィが 2/5 と低評価だった:
- フォントがシステムフォントそのまま
- 見出し・本文・メタ情報のサイズ差が小さく意図が感じられない

日本語見出し + 英数字スコアの2フォント体制を導入し、3階層の明確な型サイズ階層を作る。

## 変更内容

### 1. `app/layout.tsx`: Google Fonts の読み込み

```tsx
import { Inter, Noto_Serif_JP } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const notoSerifJP = Noto_Serif_JP({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-noto-serif-jp",
  display: "swap",
});
```

`<body>` の className に両変数を追加する:
```tsx
<body className={`${inter.variable} ${notoSerifJP.variable} ...既存クラス`}>
```

### 2. `app/globals.css`: フォント変数とスケールの定義

既存の Tryline design tokens 下に追記する:

```css
:root {
  /* fonts */
  --font-heading: var(--font-noto-serif-jp), "Noto Serif JP", serif;
  --font-body: var(--font-inter), Inter, system-ui, sans-serif;

  /* type scale */
  --text-xs:   0.75rem;   /* 12px — メタ情報（日時・会場・大会名） */
  --text-sm:   0.875rem;  /* 14px — 本文補足・バッジ */
  --text-base: 1rem;      /* 16px — 本文 */
  --text-lg:   1.125rem;  /* 18px — チーム名 */
  --text-xl:   1.25rem;   /* 20px — セクション見出し */
  --text-2xl:  1.5rem;    /* 24px — ページ見出し */
  --text-3xl:  2rem;      /* 32px — スコア表示 */
  --text-4xl:  2.5rem;    /* 40px — 勝者スコア */
}

@layer base {
  body {
    font-family: var(--font-body);
  }

  h1, h2, h3 {
    font-family: var(--font-heading);
  }
}
```

### 3. `tailwind.config.ts` への登録

```ts
theme: {
  extend: {
    fontFamily: {
      heading: ["var(--font-heading)"],
      body:    ["var(--font-body)"],
    },
  },
},
```

### 4. 既存コンポーネントへの適用（最小限）

以下の箇所のみ変更する。それ以外は手を加えない。

| 箇所 | 変更内容 |
|------|----------|
| `components/match-card.tsx` スコア部分 (`font-display`) | `font-body` に変更（Inter の tabular-nums を活用） |
| `app/c/[competition]/page.tsx` の `<h1>` | `font-heading` クラスを追加 |
| `app/c/[competition]/[season]/page.tsx` の `<h1>` | `font-heading` クラスを追加 |
| `app/matches/[id]/page.tsx` の試合タイトル `<h1>` | `font-heading` クラスを追加 |

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm build` パス（フォント読み込みエラーなし）
- 各ページ見出しが Noto Serif JP で表示される
- スコア数字が Inter の tabular-nums で表示される
- システムフォントへのフォールバックが機能する（フォント未読み込み時も崩れない）

## ブランチ・PR

- ブランチ: `feat/typography-system`
- PR タイトル: `Feat: introduce Noto Serif JP + Inter typography system`
