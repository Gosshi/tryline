# PR #70 — 料金ページのヒーロー CTA を強調する

## 背景

`app/pricing/page.tsx` のヒーローセクションにある「Premium を始める」ボタンが
小さく（`text-sm px-5 py-2.5`）、視覚的な重みが弱い。
またボタン群の下にトラストシグナルがないため、クリックの心理的障壁が残る。
ボタンを大きくし、「いつでも解約可能」の一文を添えることで転換率を上げる。

## スコープ

対象:
- `app/pricing/page.tsx` — ヒーロー内のボタン群周辺
- `app/pricing/pricing-form.tsx` — `hero` バリアントのボタンサイズ

対象外:
- ヒーローのテキスト・CTA 文言・料金は変更しない
- `inline` バリアントは変更しない
- 他のセクションは変更しない

## 現在の実装（変更前）

### `app/pricing/pricing-form.tsx`

```tsx
variant === "hero"
  ? "px-5 py-2.5 focus-visible:ring-white"
  : "px-4 py-2 focus-visible:ring-[var(--color-accent)]",
```

### `app/pricing/page.tsx` — ボタン群

```tsx
<div className="mt-8 flex flex-wrap gap-3">
  <PricingForm buttonLabel="Premium を始める — ¥980/月" />
  <Link
    className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold text-white/80 ..."
    href={trialUrl}
  >
    無料で記事を読む
  </Link>
</div>
```

## 変更後

### `app/pricing/pricing-form.tsx` — hero バリアントのサイズを拡大

`text-sm` はコンポーネント共通のクラスから除外し、バリアントごとに指定する:

```tsx
className={[
  "rounded-full bg-[var(--color-accent)] font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2",
  variant === "hero"
    ? "px-7 py-3 text-base focus-visible:ring-white"
    : "px-4 py-2 text-sm focus-visible:ring-[var(--color-accent)]",
].join(" ")}
```

### `app/pricing/page.tsx` — トラストシグナルを追加

ボタン群の下に1行追加する:

```tsx
<div className="mt-8 flex flex-wrap gap-3">
  <PricingForm buttonLabel="Premium を始める — ¥980/月" />
  <Link
    className="rounded-full border border-white/25 px-5 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:border-white/60 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
    href={trialUrl}
  >
    無料で記事を読む
  </Link>
</div>
<p className="mt-3 text-xs text-white/45">
  いつでもキャンセル可能 · Stripe 決済
</p>
```

## 変更のポイント

- ボタンを `text-sm px-5 py-2.5` → `text-base px-7 py-3` にして存在感を強調
- セカンダリボタンはサイズそのまま — 主従関係を明確にする
- トラストシグナル「いつでもキャンセル可能 · Stripe 決済」でクリックの心理的障壁を下げる
- `text-white/45` で主要テキストより目立たせず、邪魔にならない程度の存在感

## 完了の定義

- [ ] ヒーローの「Premium を始める」ボタンが以前より大きく表示される
- [ ] セカンダリボタン「無料で記事を読む」のサイズは変わらない
- [ ] ボタン群の下に「いつでもキャンセル可能 · Stripe 決済」が表示される
- [ ] `inline` バリアントのボタンサイズに変化がない
- [ ] TypeScript エラーなし・`pnpm build` 通過
