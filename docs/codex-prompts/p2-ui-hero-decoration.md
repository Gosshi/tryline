# Codex Prompt: ホームヒーロー右半分の CSS 装飾

## 前提

`p2-ui-homepage-hero.md` が完了済み。
`app/page.tsx` に `bg-[var(--color-ink)]` のダークヒーローセクションが実装済み。

---

## 背景

現在のホームヒーローはテキストが左寄せのみで、デスクトップ（1440px）では
右半分が完全な空白になっている。外部画像・外部依存なしに
CSS グラデーションと inline SVG でラグビーのフィールドライン + ボールを
装飾として配置し、スポーツアプリとしての視覚的な厚みを加える。

**モバイルでは非表示**。デスクトップ（`sm:` 以上）のみ表示。

---

## 変更対象ファイル

- `app/page.tsx`

---

## Task 1 — ヒーローセクションの構造変更

`section` に `relative overflow-hidden` を追加し、右半分装飾レイヤーを
`absolute` で配置する。テキストコンテンツは `relative` で装飾の上に乗せる。

```tsx
<section className="relative overflow-hidden bg-[var(--color-ink)] py-16 sm:py-24">
  {/* 右半分装飾レイヤー — デスクトップのみ表示 */}
  <div
    aria-hidden
    className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 sm:block"
  >
    {/* フィールドライングリッド */}
    <div
      className="absolute inset-0"
      style={{
        backgroundImage: [
          "repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.05) 39px, rgba(255,255,255,0.05) 40px)",
          "repeating-linear-gradient(90deg, transparent, transparent 59px, rgba(255,255,255,0.03) 59px, rgba(255,255,255,0.03) 60px)",
        ].join(", "),
      }}
    />
    {/* センターライン */}
    <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />
    {/* ラグビーボール — 中央配置 */}
    <div className="absolute inset-0 flex items-center justify-center opacity-[0.12]">
      <svg
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
        viewBox="0 0 200 120"
        width="340"
        xmlns="http://www.w3.org/2000/svg"
      >
        <ellipse cx="100" cy="60" rx="94" ry="44" strokeWidth="2" />
        <line strokeWidth="1.5" x1="6" x2="194" y1="60" y2="60" />
        <path d="M100 16 C112 35, 112 85, 100 104" strokeWidth="1.5" />
        <line strokeWidth="2" x1="88" x2="112" y1="48" y2="48" />
        <line strokeWidth="2" x1="86" x2="114" y1="54" y2="54" />
        <line strokeWidth="2" x1="86" x2="114" y1="60" y2="60" />
        <line strokeWidth="2" x1="86" x2="114" y1="66" y2="66" />
        <line strokeWidth="2" x1="88" x2="112" y1="72" y2="72" />
      </svg>
    </div>
    {/* 右端フェードアウト */}
    <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-[var(--color-ink)] to-transparent" />
  </div>

  {/* テキストコンテンツ（relative で装飾より前面に） */}
  <div className="relative mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
    <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]">
      AI Rugby Analysis in Japanese
    </p>
    <h1 className="font-serif text-5xl font-bold leading-tight tracking-tight text-white sm:text-7xl">
      海外ラグビーを、<br className="hidden sm:block" />
      日本語で深掘り。
    </h1>
    <p className="mt-5 max-w-xl text-base leading-relaxed text-white/60">
      Six Nations をはじめとする世界のラグビーリーグを、AI
      が生成した日本語プレビュー・レビューと試合チャットで楽しめます。
    </p>
  </div>
</section>
```

---

## 完了条件

- [ ] デスクトップ（`sm:` 以上）でヒーロー右半分にフィールドライン + ラグビーボールの装飾が表示される
- [ ] モバイル（375px）では装飾が非表示で既存のテキストレイアウトが変わらない
- [ ] 装飾は `aria-hidden` + `pointer-events-none` でアクセシビリティとインタラクションに影響しない
- [ ] テキストコンテンツの可読性が損なわれていない
- [ ] `pnpm tsc --noEmit` がパスする
- [ ] `pnpm build` が成功する

## 変更しないこと

- テキストコンテンツ（文言・クラス）
- `py-16 sm:py-24` のパディング
- `max-w-6xl` のコンテナ幅
- ヒーロー下部のコンテンツセクション（大会カード・アーカイブリスト）
