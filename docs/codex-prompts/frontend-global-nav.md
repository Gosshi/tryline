# Codex プロンプト: グローバルナビゲーション

## 目的

- サイト共通のヘッダーナビゲーションを追加する
- `app/layout.tsx` に組み込んで全ページに表示する
- ホームページのヘッダーから「Tryline」バッジを削除する（ナビに移動するため）

---

## 現状

- `app/layout.tsx` に `<body>{children}</body>` しかなく、グローバルナビがない
- ホームページ (`app/page.tsx`) の `<header>` ブロックに emerald バッジ `Tryline` がある
- 試合詳細ページには `← 一覧に戻る` リンクがある（これはそのまま残す）

---

## タスク 1: `SiteHeader` コンポーネントの作成

`components/site-header.tsx` を新規作成する。

### デザイン

- `position: sticky; top: 0; z-index: 40` で常時上部固定
- 背景: `bg-white/90 backdrop-blur-sm` + 下ボーダー `border-b border-slate-200`
- 高さ: `h-14`
- 内側: `max-w-6xl mx-auto px-4 sm:px-6 md:px-8` で横幅を揃える
- 左側: Tryline ロゴ（ホームへのリンク）
- 右側: 現時点では空（将来の認証ボタン等のプレースホルダーとして `<div>` を置いておく）

### ロゴのデザイン

- `Tryline` テキスト: `text-lg font-black tracking-tight text-slate-950`
- テキストの左に emerald の小さなドット: `w-2 h-2 rounded-full bg-emerald-500`
- ホーム (`/`) へのリンク

```tsx
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 md:px-8">
        <Link
          className="flex items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          href="/"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-lg font-black tracking-tight text-slate-950">
            Tryline
          </span>
        </Link>

        {/* 将来の認証ボタン等 */}
        <div />
      </div>
    </header>
  );
}
```

---

## タスク 2: `app/layout.tsx` に `SiteHeader` を追加

```tsx
import { SiteHeader } from "@/components/site-header";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tryline",
  description: "海外ラグビー観戦を日本語で支援する AI コンパニオン",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
```

---

## タスク 3: `app/page.tsx` のヘッダーから Tryline バッジを削除

ホームページの `<header>` ブロックにある以下の要素を削除する:

```tsx
// 削除する
<span className="inline-block rounded-full bg-emerald-500 px-3 py-0.5 text-xs font-semibold uppercase tracking-widest text-white">
  Tryline
</span>
```

グローバルナビに移動したため不要。`<h1>` のコンペティション名がヘッダーの最上位になる。

---

## 変更するファイル一覧

| ファイル | 変更内容 |
|---|---|
| `components/site-header.tsx` | 新規作成 |
| `app/layout.tsx` | `SiteHeader` を追加 |
| `app/page.tsx` | `Tryline` バッジを削除 |

---

## 完了条件

- `pnpm tsc --noEmit` がエラーなし
- ホームページ・試合詳細ページ両方の上部に `● Tryline` ナビが表示される
- スクロールしてもナビが上部に固定される
- ホームページの `<header>` に emerald バッジが残っていない
