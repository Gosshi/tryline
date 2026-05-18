# PR #65 — ヒーローセクションにラグビー SVG テクスチャを追加

## 背景

ホームページと料金ページのダークヒーローは純テキスト＋グラデーションのみで、
ラグビーというスポーツの熱量・ビジュアルが伝わらない。
外部画像を使わず、SVG でラグビーフィールドのライン模様を薄く重ねることで
コストゼロでブランド感を高める。

## スコープ

対象:
- `app/page.tsx` — ホームヒーローセクション
- `app/pricing/page.tsx` — 料金ページヒーローセクション
- `components/hero-texture.tsx` — 新規作成する共通テクスチャコンポーネント

対象外:
- その他のページのヒーロー
- テキスト・CTA の変更

## 実装仕様

### `components/hero-texture.tsx` を新規作成

ラグビーフィールドの「22mライン」「センターライン」「インゴール」を
抽象的に表現した SVG を返す純粋なコンポーネント。

```tsx
export function HeroTexture() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 1440 600"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* センターライン（縦） */}
      <line x1="720" y1="0" x2="720" y2="600" stroke="white" strokeOpacity="0.04" strokeWidth="1.5" />

      {/* 22m ライン（左） */}
      <line x1="288" y1="0" x2="288" y2="600" stroke="white" strokeOpacity="0.03" strokeWidth="1" />

      {/* 22m ライン（右） */}
      <line x1="1152" y1="0" x2="1152" y2="600" stroke="white" strokeOpacity="0.03" strokeWidth="1" />

      {/* インゴール（左端） */}
      <line x1="72" y1="0" x2="72" y2="600" stroke="white" strokeOpacity="0.025" strokeWidth="1" />

      {/* インゴール（右端） */}
      <line x1="1368" y1="0" x2="1368" y2="600" stroke="white" strokeOpacity="0.025" strokeWidth="1" />

      {/* 水平センターライン */}
      <line x1="0" y1="300" x2="1440" y2="300" stroke="white" strokeOpacity="0.03" strokeWidth="1" />

      {/* センターサークル */}
      <circle cx="720" cy="300" r="80" fill="none" stroke="white" strokeOpacity="0.04" strokeWidth="1.5" />

      {/* 楕円形ボール（装飾） */}
      <ellipse cx="720" cy="300" rx="160" ry="110" fill="none" stroke="white" strokeOpacity="0.025" strokeWidth="1" />
    </svg>
  );
}
```

### ホームヒーローへの適用

ヒーローセクションの最外層 div に `relative overflow-hidden` を追加（既にある場合はそのまま）し、
`<HeroTexture />` を最初の子要素として挿入する:

```tsx
<section className="relative overflow-hidden ...">
  <HeroTexture />
  {/* 既存コンテンツ */}
</section>
```

### 料金ページヒーローへの適用

同様に `app/pricing/page.tsx` のヒーロー `<section>` に適用する。

## デザイン原則

- `strokeOpacity` は `0.025〜0.04` の範囲に収める（テキストへの干渉を防ぐ）
- `pointer-events-none` で操作への影響をゼロにする
- `aria-hidden` でスクリーンリーダーに無視させる
- 外部リソース不使用（pure SVG）

## 完了の定義

- [ ] ホームヒーローにフィールドライン模様の SVG テクスチャが表示される
- [ ] 料金ページヒーローに同じテクスチャが表示される
- [ ] テキスト・CTA の可読性に影響がない
- [ ] `components/hero-texture.tsx` として独立したコンポーネントに切り出されている
- [ ] TypeScript エラーなし・`pnpm build` 通過
