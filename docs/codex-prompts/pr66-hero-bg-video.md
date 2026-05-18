# PR #66 — ホームヒーローの背景を動画に置き換える

## 背景

ホームページのヒーローセクション（`app/page.tsx`）は現在、
Unsplash の外部 URL から画像を取得して `opacity-25` で背景表示している。
`public/hero-bg.mp4`（10秒 H.264 ループ動画）が用意されたため、
外部依存をなくしつつ動きのある背景に差し替える。

## スコープ

対象:
- `app/page.tsx` — ヒーロー背景の `<Image>` を `<video>` に置き換え

対象外:
- ヒーローのテキスト・CTA・HeroTexture・右側装飾パネルは変更しない
- 料金ページは変更しない（別 PR で対応予定）

## 現在の構造（変更前）

```tsx
<div aria-hidden className="absolute inset-0 z-0">
  <Image
    alt=""
    className="object-cover object-center opacity-25"
    fill
    priority
    sizes="100vw"
    src="https://images.unsplash.com/photo-1763854413165-1713bc5a7f4a?w=1600&q=80"
  />
  <div className="bg-[var(--color-ink)]/60 absolute inset-0" />
</div>
```

## 変更後

`<Image>` を `<video>` に置き換える。それ以外の構造は一切変更しない。

```tsx
<div aria-hidden className="absolute inset-0 z-0">
  <video
    autoPlay
    className="absolute inset-0 h-full w-full object-cover object-center opacity-25"
    loop
    muted
    playsInline
    preload="none"
  >
    <source src="/hero-bg.mp4" type="video/mp4" />
  </video>
  <div className="bg-[var(--color-ink)]/60 absolute inset-0" />
</div>
```

### 変更のポイント

- `autoPlay muted loop playsInline` — ブラウザの自動再生ポリシーを満たす必須の組み合わせ
- `opacity-25` — 既存と同じ不透明度を維持（テキスト可読性を保つ）
- `preload="none"` — 初期ロードの帯域を節約
- `aria-hidden` の `<div>` は既存のまま維持（アクセシビリティ対応済み）
- `next/image` の `<Image>` コンポーネントの import が他で使われていなければ削除してよい

## 完了の定義

- [ ] ホームページのヒーロー背景がループ動画（ゆっくりズーム）になっている
- [ ] テキスト・CTA が動画の上で読める
- [ ] モバイル（375px）でも動画が全画面背景として表示される
- [ ] Unsplash への外部リクエストがなくなっている
- [ ] TypeScript エラーなし・`pnpm build` 通過
