# ホームヒーロー背景を生成画像に置き換える

## 背景

`docs/design-ui-growth-review-2026-07-03.md`（B-1, C-2）で、ホームページのヒーロー背景 `public/hero-bg.mp4` の出所ライセンスが不明であることが判明した（`docs/codex-prompts/pr66-hero-bg-video.md` に出所の記載がなく、当時 Unsplash 写真を動画に差し替えた経緯のみ記載）。同レビューの方針（実在写真素材ではなく LLM 生成画像を使う）に沿って、Owner が生成した静止画 `public/visuals/home-hero.jpg` に差し替える。

## スコープ

**対象:** `app/page.tsx` のヒーロー背景部分のみ

**対象外:**
- ヒーローのテキスト・CTA・`HeroTexture`・右側装飾パネルは変更しない（`docs/codex-prompts/pr66-hero-bg-video.md` の対象外指定を踏襲）
- 料金ページ（変更しない）
- 他ページのヒーロー・キービジュアル

## 実装詳細

`app/page.tsx` の該当箇所（`<section className="relative overflow-hidden bg-[var(--color-ink)] py-16 sm:py-24">` 内、`<video>` を使っている部分）を `next/image` の `<Image>` に置き換える。`Image` は既に `app/page.tsx` の先頭でインポート済み。

```tsx
// 変更前
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

// 変更後
<div aria-hidden className="absolute inset-0 z-0">
  <Image
    alt=""
    className="object-cover object-center opacity-25"
    fill
    priority
    sizes="100vw"
    src="/visuals/home-hero.jpg"
  />
  <div className="bg-[var(--color-ink)]/60 absolute inset-0" />
</div>
```

- `opacity-25` と背景オーバーレイ（`bg-[var(--color-ink)]/60`）はテキスト可読性を保つため既存のまま維持する
- `alt=""` は既存の大会ロゴ等と同様の装飾画像パターンに合わせる（`aria-hidden` の親要素があるため）
- `priority` はヒーロー画像なので LCP 最適化のため付与する（`app/c/[competition]/page.tsx` の既存ヒーロー画像パターンと同様）

### `public/hero-bg.mp4` の扱い

コードから参照されなくなるため、同じ PR 内で削除してよい。動画ファイルは 1.5MB あり、リポジトリに残しておく理由がない。

## 受け入れ条件

1. ホームページのヒーロー背景が `/visuals/home-hero.jpg` の静止画になっている
2. `<video>` タグ・`public/hero-bg.mp4` への参照がコードから消えている
3. `public/hero-bg.mp4` ファイル自体が削除されている
4. テキスト・CTA の可読性が既存と同等（`opacity-25` + オーバーレイの組み合わせを維持しているため自動的に満たされる想定）
5. モバイル幅（375px）でも画像が全画面背景として表示される
6. `pnpm tsc --noEmit` / `pnpm build` が通る

## 未解決の質問

- 元の動画は「ゆっくりズームするループ動画」という動きの演出があった。静止画化することで動きが失われる点をOwnerが許容するか（レビュー時点では画像化を推奨する結論だったため、本specはその前提で進める）
