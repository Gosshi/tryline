# feat-hero-images: ヒーロー画像の追加

## 背景

ホームページとコンペティションハブページに Unsplash の写真を追加し、視覚的な印象を改善する。Unsplash License は商用利用可・帰属表示不要。

---

## Task 1 — `next.config.ts` に remotePatterns を追加

```ts
images: {
  remotePatterns: [
    { protocol: "https", hostname: "images.unsplash.com" },
  ],
},
```

既存の `remotePatterns` がある場合は配列に追記する。

---

## Task 2 — ホームページ（`app/page.tsx`）にフォトテクスチャを追加

ダークヒーロー `<section>` の直下（既存コンテンツの背後）に写真レイヤーを追加する。

```tsx
<div aria-hidden className="absolute inset-0 z-0">
  <Image
    alt=""
    className="object-cover object-center opacity-[0.12]"
    fill
    priority
    sizes="100vw"
    src="https://images.unsplash.com/photo-1763854413165-1713bc5a7f4a?w=1600&q=80"
  />
  <div className="absolute inset-0 bg-[var(--color-ink)]/60" />
</div>
```

- `next/image` の `Image` を使う
- 既存コンテンツの z-index は変更しない（写真レイヤーは z-0）
- ヒーロー `<section>` に `relative` クラスが付いていない場合は追加する

---

## Task 3 — コンペティションハブ（`app/c/[competition]/page.tsx`）にバナーを追加

ページ冒頭に写真バナーを追加する。既存の `<h1>` は削除し、バナー内に移動する。

```tsx
<div className="relative h-48 w-full overflow-hidden sm:h-56">
  <Image
    alt={formatFamilyName(competition)}
    className="object-cover object-center"
    fill
    priority
    sizes="100vw"
    src="https://images.unsplash.com/photo-1767190937750-d6aaf8ea99d0?w=1200&q=80"
  />
  <div className="absolute inset-0 bg-slate-950/60" />
  <div className="absolute inset-0 flex flex-col justify-end px-4 pb-6 sm:px-6 md:px-8">
    <div className="mx-auto w-full max-w-4xl">
      <h1 className="font-heading text-2xl font-bold tracking-tight text-white sm:text-3xl">
        {formatFamilyName(competition)}
      </h1>
      <p className="mt-1 text-sm text-white/70">全シーズン一覧</p>
    </div>
  </div>
</div>
```

- `next/image` の `Image` を使う
- `formatFamilyName` は既存のインポートを使う
- バナーより下のシーズン一覧リストは変更しない

---

## 変更しないこと

- ホームページのヒーロー以外のセクション
- コンペティションハブのシーズン一覧・ナビゲーション
- 既存のスタイル・レイアウト構造

---

## 完了条件

- [ ] ホームページのヒーローに写真テクスチャが表示される（暗めの半透明オーバーレイあり）
- [ ] `/c/[competition]` ページの冒頭に写真バナーが表示される
- [ ] `next/image` の `Image` を使用している（`<img>` タグ直書きは不可）
- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス
