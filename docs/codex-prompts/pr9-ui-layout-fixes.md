# chore: UI レイアウト細部の修正（5 項目）

## 目的

Playwright スクリーンショットのレビューで判明した 5 件のビジュアル問題を修正する。
機能変更はなし。レイアウト・サイズ・スタイルの調整のみ。

**必ず `design.md` を最初に読んでから実装すること。**

---

## 修正項目

### 1. 試合詳細ページのコンテンツ幅を拡大

**ファイル**: `app/matches/[id]/page.tsx`

1440px 幅のデスクトップで `max-w-4xl`（896px）は空白が多すぎる。
`max-w-5xl`（1024px）に変更して読みやすい行長を確保する。

```tsx
// 変更前（71行目付近）
<div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 md:px-8">
// 変更後
<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 md:px-8">
```

---

### 2. YouTube ハイライトボタンを視認性の高い CTA に強化

**ファイル**: `components/match-header.tsx`

現在のボタンは ghost スタイルで CTA として目立たない。
赤みを帯びた塗りつぶし背景で YouTube ブランドカラーを活かした、
しっかりした CTA ボタンに変更する。

```tsx
// 変更前（className）
className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-200"

// 変更後
className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
```

あわせて SVG アイコンの色も白に変更する:

```tsx
// 変更前
className="h-3.5 w-3.5 text-red-500"
// 変更後
className="h-4 w-4 text-white"
```

---

### 3. サイトヘッダーのロゴを大きく・存在感を強化

**ファイル**: `components/site-header.tsx`

ロゴドットが小さく、ブランドとしての存在感が弱い。
ドットサイズと文字サイズを一段階引き上げる。

```tsx
// ドット: 変更前
<span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />
// ドット: 変更後
<span className="h-2.5 w-2.5 rounded-full bg-[var(--color-accent)]" />

// 文字: 変更前
<span className="text-lg font-black tracking-tight text-slate-950">
// 文字: 変更後
<span className="text-xl font-black tracking-tight text-slate-950">
```

---

### 4. モバイルヒーロー見出しの改行を修正

**ファイル**: `app/page.tsx`

モバイル（390px）で「日本語で深掘り。」の末尾「掘り。」が
単独行に落ちてしまっている。
`break-keep` を追加して単語単位の改行を防ぎつつ、
`<br>` を `sm:block` のみに留める。

```tsx
// 変更前
<h1 className="font-serif text-5xl font-bold leading-tight tracking-tight text-white sm:text-7xl">
  海外ラグビーを、<br className="hidden sm:block" />
  日本語で深掘り。
</h1>

// 変更後
<h1 className="break-keep font-serif text-5xl font-bold leading-tight tracking-tight text-white sm:text-7xl">
  海外ラグビーを、<br className="hidden sm:block" />
  日本語で深掘り。
</h1>
```

---

### 5. フッター上余白を適切なサイズに縮小

**ファイル**: `components/site-footer.tsx`

PR8 で `mt-24`（96px）に拡大したが、ページ末尾で過剰な空白になっている。
`mt-16`（64px）に戻してバランスを整える。

```tsx
// 変更前
<footer className="mt-24 border-t border-slate-200 bg-white">
// 変更後
<footer className="mt-16 border-t border-slate-200 bg-white">
```

---

## 変更するファイル

- `app/matches/[id]/page.tsx`
- `components/match-header.tsx`
- `components/site-header.tsx`
- `app/page.tsx`
- `components/site-footer.tsx`

## 変更しないこと

- `app/globals.css`
- `tailwind.config.ts`
- `design.md`（参照するだけ）
- データクエリ・型定義・コンポーネント構造
- ロジック・条件分岐

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm build` 成功
- 試合詳細ページのコンテンツ幅が `max-w-5xl` であること
- YouTube ボタンが赤い塗りつぶし CTA として表示されること
- ヘッダーロゴのドットが `h-2.5 w-2.5`・文字が `text-xl` であること
- モバイルヒーロー見出しに `break-keep` が適用されていること
- フッターの上余白が `mt-16` であること

## ブランチ・PR

- ブランチ: `chore/ui-layout-fixes`
- PR タイトル: `Chore: UI layout fixes — content width, YouTube CTA, logo, hero break, footer margin`
