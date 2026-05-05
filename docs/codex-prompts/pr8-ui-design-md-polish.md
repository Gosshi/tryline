# chore: design.md に基づく UI ポリッシュ

## 目的

プロジェクトルートの `design.md` を参照し、既存コンポーネント・ページの
デザイントークン使用・余白・インタラクション・フォーカスリングを統一する。
機能変更はなし。視覚的な品質向上のみ。

**必ず `design.md` を最初に読んでから実装すること。**

## 変更箇所と内容

### 1. `components/site-header.tsx`

**ロゴのドット色をデザイントークンに統一**
```tsx
// 変更前
<span className="h-2 w-2 rounded-full bg-emerald-500" />
// 変更後
<span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />
```

**フォーカスリングを design.md のアクセントカラーに統一**
```tsx
// ロゴリンク・ナビリンクすべての focus-visible:ring-slate-400 を変更
focus-visible:ring-[var(--color-accent)]
```

### 2. `components/site-footer.tsx`

**上部余白を design.md の breathing room 原則に合わせる**
```tsx
// 変更前
<footer className="mt-16 border-t ...">
// 変更後
<footer className="mt-24 border-t ...">
```

### 3. `app/c/[competition]/[season]/page.tsx`

**family 表示名を `formatFamilyName` で正しく変換する（現在 `replace(/-/g, " ")` のみ）**
```tsx
import { formatCompetitionTitle, formatFamilyName } from "@/lib/format/competition";

// 変更前（105行目付近）
{comp.family.replace(/-/g, " ")}
// 変更後
{formatFamilyName(comp.family)}
```

**ページヘッダーに下余白を追加して大会タイトルに breathing room を確保**
```tsx
// 変更前
<header className="space-y-3 border-b border-[var(--color-rule)] pb-8">
// 変更後
<header className="space-y-3 border-b border-[var(--color-rule)] pb-10">
```

### 4. `components/match-card.tsx`

**hover の shadow を design.md の card-hover に合わせる**
```tsx
// hover:shadow-md を以下に変更
hover:shadow-[0_10px_18px_rgb(15_23_42/0.10)]
```

**フォーカスリングを accent に統一**
```tsx
// focus-visible:ring-2 に続く色を変更
focus-visible:ring-[var(--color-accent)]
```

### 5. `app/page.tsx`

**各セクション間のスペーシングを拡大（breathing room）**
```tsx
// 変更前
<div className="mx-auto max-w-6xl space-y-10 ...">
// 変更後
<div className="mx-auto max-w-6xl space-y-12 ...">
```

### 6. `components/match-header.tsx`

**メタ行の余白を 8px グリッドに揃える**
```tsx
// 変更前
<div className="mt-7 flex flex-wrap ...">
// 変更後
<div className="mt-8 flex flex-wrap ...">
```

## 変更するファイル

- `components/site-header.tsx`
- `components/site-footer.tsx`
- `components/match-card.tsx`
- `components/match-header.tsx`
- `app/c/[competition]/[season]/page.tsx`
- `app/page.tsx`

## 変更しないこと

- `app/globals.css`
- `tailwind.config.ts`
- データクエリ・型定義
- `design.md`（参照するだけ）
- ロジック・条件分岐・コンポーネント構造

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm build` 成功
- `site-header.tsx` のロゴドットとフォーカスリングが `--color-accent` を使っていること
- シーズンページの family 名が `formatFamilyName` で表示されること（例: "urc" → "URC"）
- 全対象ファイルでフォーカスリングが `ring-[var(--color-accent)]` に統一されていること

## ブランチ・PR

- ブランチ: `chore/ui-design-md-polish`
- PR タイトル: `Chore: apply design.md tokens — spacing, focus rings, and component polish`
