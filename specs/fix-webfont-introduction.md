# 全体デザイン: Web フォントを導入してスポーツメディアらしい個性を出す

## 背景

Tryline は現在システムフォント（`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`）を
使用しており、スポーツメディアとして期待されるエネルギー感・個性が乏しい。

競合スポーツメディア（ESPN、Sky Sports、Rugby World）はすべてカスタムフォントを採用しており、
タイポグラフィがブランド認知の重要な要素となっている。

## スコープ

対象:
- `app/layout.tsx` — `next/font/google` でフォント読み込みと CSS 変数設定
- `tailwind.config.ts` — フォントファミリーをカスタムクラスに登録

対象外:
- フォントの細かいサイズ・ウェイト・カラー調整（このタスクでは読み込み設定のみ）
- 全コンポーネントの個別フォントクラス適用（layout.tsx のデフォルトとして設定）

## データモデル変更

なし

## API サーフェス

なし

## UI サーフェス

### 推奨フォント（たたき台）

| 用途 | フォント候補 | 理由 |
|------|-------------|------|
| 見出し | Oswald（Google Fonts） | スポーツ・ニュース系で定番。太くコンデンスドで力強い |
| 本文 | Noto Sans JP（Google Fonts） | 日本語品質が高く、CJK テキストとの相性が良い |

コストゼロ・読み込み最適化済みの `next/font/google` で実装する。

### `app/layout.tsx` の変更

```typescript
import { Oswald, Noto_Sans_JP } from "next/font/google";

const heading = Oswald({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-heading",
});
const body = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body",
});

// <html> に className を追加
<html lang="ja" className={`${heading.variable} ${body.variable}`}>
```

### `tailwind.config.ts` の変更

```typescript
fontFamily: {
  heading: ["var(--font-heading)", "sans-serif"],
  body:    ["var(--font-body)",    "sans-serif"],
},
```

## LLM 連携

なし

## 受け入れ条件

1. `next/font/google` で Oswald と Noto Sans JP が読み込まれている
2. `font-display: swap` が有効で CLS が最小化されている
3. `tsc --noEmit` でビルドエラーなし
4. Playwright で PC・モバイル双方のスクリーンショットを撮り、フォントが適用されていることを確認

## 未解決の質問

- フォント候補（Oswald / Noto Sans JP）は Owner が最終確認すること。
  他の候補: Inter + Noto Sans JP、Barlow Condensed + Noto Sans JP
- 既存の `var(--font)` カスタムプロパティとの統合方法は Codex が判断すること