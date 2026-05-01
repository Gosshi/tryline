# Codex Prompt: シーズンページの汎用ヒーロー削除とコンペティションヘッダー強化

## 前提

`p2-design-tokens.md` が完了していること（`--color-ink`、`--color-accent`、`--color-rule`、`--font-noto-serif-jp` が利用可能）。

---

## 背景

現在の `app/c/[competition]/[season]/page.tsx` には、`app/page.tsx` と**全く同じ文言のヒーローセクション**が重複コピーされている。この汎用ヒーローは：

1. 「海外ラグビーを、日本語で深掘り。」というホーム向けのキャッチコピーをシーズンページでも表示するため、文脈がずれている
2. 画面上部の約 250px を無意味に占有し、実際のコンテンツ（大会名・試合リスト）への到達を遅らせる
3. モバイルではファーストビューに大会コンテンツがほとんど入らない原因になっている

本プロンプトでは汎用ヒーローを削除し、シーズン固有のヘッダーに置き換える。

---

## 変更対象ファイル

`app/c/[competition]/[season]/page.tsx` のみ

---

## Task 1 — 汎用ヒーローセクションを削除

以下の `<section>` ブロックを **まるごと削除** する。

```tsx
// 削除するコード
<section className="border-b border-slate-200 bg-white py-12 sm:py-16">
  <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
    <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-emerald-600">
      AI Rugby Analysis in Japanese
    </p>
    <h1 className="text-5xl font-bold tracking-tight text-slate-950 sm:text-6xl">
      海外ラグビーを、日本語で深掘り。
    </h1>
    <p className="mt-4 max-w-xl text-base text-slate-600">
      Six Nations をはじめとする世界のラグビーリーグを、AI
      が生成した日本語プレビュー・レビューと試合チャットで楽しめます。
    </p>
  </div>
</section>
```

---

## Task 2 — コンペティションヘッダーを h1 昇格＋デザイン強化

現在の `<header>` セクションを以下のように変更する。

### 変更前

```tsx
<header className="space-y-3 border-b border-slate-200 pb-6">
  <h2 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
    {formatCompetitionTitle(comp.name, comp.season)}
  </h2>
  {dateRange && <p className="text-sm text-slate-500">{dateRange}</p>}
</header>
```

### 変更後

```tsx
<header className="space-y-3 border-b border-[var(--color-rule)] pb-8">
  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
    {comp.family.replace(/-/g, " ")}
  </p>
  <h1 className="font-serif text-4xl font-bold tracking-tight text-[var(--color-ink)] sm:text-5xl">
    {formatCompetitionTitle(comp.name, comp.season)}
  </h1>
  {dateRange && (
    <p className="text-sm text-[var(--color-ink-muted)]">{dateRange}</p>
  )}
</header>
```

**変更のポイント:**
- `h2` → `h1`（汎用ヒーローを削除したため、この見出しがページ最上位の h1 になる）
- `text-2xl sm:text-3xl` → `font-serif text-4xl sm:text-5xl`（スケール拡大 + serif フォント）
- `text-slate-950` → `text-[var(--color-ink)]`（デザイントークンに統一）
- `border-slate-200` → `border-[var(--color-rule)]`（デザイントークンに統一）
- eyebrow として `comp.family`（例: "six nations"）をエメラルドで表示し、大会カテゴリを示す
- `pb-6` → `pb-8`（ヘッダーが大きくなったため余白を増やす）

---

## Task 3 — SeasonSwitcher の配置を header の直後に移動

現在 `<SeasonSwitcher>` は `<header>` より前に独立したセクションとして配置されている。汎用ヒーロー削除後の構造では、大会タイトルを確認してからシーズンを切り替えるフローの方が自然なため、`<SeasonSwitcher>` を `<header>` の直後（試合リストの直前）に移動する。

### 変更前の JSX 順序

```tsx
<SeasonSwitcher ... />

<header className="...">
  <h2>...</h2>
  ...
</header>

{/* 試合リスト */}
```

### 変更後の JSX 順序

```tsx
<header className="...">
  <p>eyebrow</p>
  <h1>...</h1>
  <p>dateRange</p>
</header>

<SeasonSwitcher ... />

{/* 試合リスト */}
```

---

## 完了条件

- [ ] シーズンページに「海外ラグビーを、日本語で深掘り。」が表示されなくなる
- [ ] シーズンページの最上位見出し（h1）が大会名（例: "Six Nations 2025"）になる
- [ ] `<h1>` が `font-serif text-4xl sm:text-5xl` で描画される
- [ ] eyebrow に `comp.family`（例: "six nations"）がエメラルドで表示される
- [ ] `<SeasonSwitcher>` が `<header>` の直後に配置されている
- [ ] モバイルでファーストビューに試合カードが入るようになる（汎用ヒーロー分の空間が解放される）
- [ ] `pnpm tsc --noEmit` がパスする
- [ ] `pnpm build` が成功する

## 変更しないこと

- ページのルーティング・データ取得ロジック
- `SeasonSwitcher` コンポーネントの内部実装（`components/season-switcher.tsx`）
- 試合リスト・順位表のレイアウト
- `components/` 以下のファイル
