# chore: PWA 対応（manifest・アイコン・theme-color）

## 目的

Tryline をインストール可能な PWA（Progressive Web App）にする。
iOS / Android のホーム画面追加・スプラッシュ表示・ブラウザ UI の非表示が目的。
Service Worker による offline 対応は本 PR の対象外とし、最小限の PWA 設定のみ行う。

**必ず `design.md` を最初に読んでから実装すること。**

## 参照すべきファイル

- `app/layout.tsx` — 既存 metadata を確認
- `design.md` — `--color-accent` の実際の hex 値を確認（`theme_color` に使用）

## 実装

### 1. `app/manifest.ts` を新規作成

Next.js の `MetadataRoute.Manifest` を使い、`/manifest.webmanifest` を自動生成する。
`theme_color` は `design.md` の `--color-accent` 値に合わせること。

```ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tryline",
    short_name: "Tryline",
    description:
      "海外ラグビーの試合結果・AI日本語レビューをリアルタイムで。",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#16a34a",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
```

---

### 2. アイコンファイルを `public/icons/` に配置

以下の 3 ファイルを `public/icons/` に作成する。
シンプルなラグビーボール or Tryline ロゴ（緑背景 + 白ドット）のデザインでよい。
`sharp` ライブラリでプログラム生成する。

| ファイル | サイズ | 用途 |
|---|---|---|
| `icon-192.png` | 192×192 | Android ホーム画面 |
| `icon-512.png` | 512×512 | PWA スプラッシュ |
| `icon-maskable-512.png` | 512×512 | Adaptive icon（safe zone 内にロゴを収める） |

アイコン生成スクリプト `scripts/generate-icons.ts`:

```ts
// pnpm add -D sharp
// pnpm tsx scripts/generate-icons.ts

import path from "path";
import sharp from "sharp";

const sizes = [
  { name: "icon-192.png", size: 192, maskable: false },
  { name: "icon-512.png", size: 512, maskable: false },
  { name: "icon-maskable-512.png", size: 512, maskable: true },
];

async function main() {
  for (const { name, size, maskable } of sizes) {
    const padding = maskable ? Math.round(size * 0.1) : 0;
    const inner = size - padding * 2;
    const r = Math.round(inner * 0.12);

    await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 22, g: 163, b: 74, alpha: 1 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            `<svg width="${inner}" height="${inner}" xmlns="http://www.w3.org/2000/svg">
              <circle cx="${inner / 2}" cy="${inner / 2}" r="${r}" fill="white"/>
            </svg>`,
          ),
          left: padding,
          top: padding,
        },
      ])
      .png()
      .toFile(path.join("public/icons", name));

    console.log(`Generated ${name}`);
  }
}

main().catch(console.error);
```

---

### 3. `app/layout.tsx` に `themeColor`・`appleWebApp` を追加

既存の `metadata` オブジェクトに追記する。

```tsx
export const metadata: Metadata = {
  // ... 既存フィールド（metadataBase, title, description, openGraph） ...
  themeColor: "#16a34a",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Tryline",
  },
};
```

---

## 変更・作成するファイル

- `app/manifest.ts`（新規作成）
- `public/icons/icon-192.png`（新規作成）
- `public/icons/icon-512.png`（新規作成）
- `public/icons/icon-maskable-512.png`（新規作成）
- `app/layout.tsx`（`themeColor`・`appleWebApp` を metadata に追加）
- `scripts/generate-icons.ts`（新規作成）

## 変更しないこと

- `app/globals.css`
- `components/` 以下のコンポーネント
- 既存ページのロジック

## 完了条件

- `/manifest.webmanifest` にアクセスして JSON が返ること
- `icons` 配列に 3 エントリが含まれること
- Chrome DevTools の Application タブで「Installable」と表示されること
- `pnpm tsc --noEmit` パス
- `pnpm build` 成功

## ブランチ・PR

- ブランチ: `chore/pwa`
- PR タイトル: `Chore: add PWA manifest, icons, and theme-color for installability`
