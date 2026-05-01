# Codex Prompt: トップページのヒーロー刷新とコンテンツグリッド化

## 前提

`p2-design-tokens.md` が完了していること（`--color-ink`、`--color-accent`、`--font-noto-serif-jp`、`--font-fraunces` が利用可能）。

---

## 背景

現在のトップページ（`app/page.tsx`）は「白いボックスのテキスト＋2つのリンク」しかなく、ページ下半分が空白になる。スポーツアプリとしての熱量・臨場感がゼロで、初回訪問者へのインパクトがない。以下の2点を改善する：

1. ヒーローセクションをダーク背景のエディトリアルデザインに変更する
2. 大会へのリンクをリストからカードグリッドに変換する

---

## 変更対象ファイル

`app/page.tsx` のみ

---

## Task 1 — ヒーローセクションをダーク背景に変更

### 変更前

```tsx
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

### 変更後

```tsx
<section className="bg-[var(--color-ink)] py-16 sm:py-24">
  <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-8">
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

**変更のポイント:**
- `bg-white` → `bg-[var(--color-ink)]`（ダーク背景）
- `text-slate-950` → `text-white`、サブテキスト → `text-white/60`
- eyebrow → `text-[var(--color-accent)]`（エメラルドグリーン）
- `h1` に `font-serif` クラスを追加（Noto Serif JP / Fraunces）
- `sm:text-7xl` でデスクトップではさらに大きく

---

## Task 2 — 「最新シーズン」セクションをフィーチャーカードに変更

### 変更前

```tsx
{latestCompetition && (
  <section className="space-y-3">
    <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-slate-600">
      最新シーズン
    </h2>
    <Link
      className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
      href={`/c/${latestCompetition.family}/${latestCompetition.season}`}
    >
      <span className="text-lg font-semibold text-slate-900">
        {formatCompetitionTitle(latestCompetition.name, latestCompetition.season)}
      </span>
      <span className="text-sm text-slate-500">試合一覧 →</span>
    </Link>
  </section>
)}
```

### 変更後

```tsx
{latestCompetition && (
  <section>
    <Link
      className="group block rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-slate-300"
      href={`/c/${latestCompetition.family}/${latestCompetition.season}`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
        最新シーズン
      </p>
      <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-ink)] sm:text-4xl">
        {formatCompetitionTitle(latestCompetition.name, latestCompetition.season)}
      </p>
      <p className="mt-4 text-sm text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-ink)]">
        試合一覧を見る →
      </p>
    </Link>
  </section>
)}
```

**変更のポイント:**
- セクション見出し（`<h2>`）を廃止し、カード内 eyebrow に統合
- `flex` 横並び → `block` 縦展開、内側余白を増やす
- 大会名を `font-serif text-3xl sm:text-4xl` で大きく
- hover で `-translate-y-0.5 shadow-md`（match-card と同パターン）

---

## Task 3 — 「大会アーカイブ」セクションをグリッドに変換

### 変更前

```tsx
<section className="space-y-3">
  <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-slate-600">
    大会アーカイブ
  </h2>
  {families.length === 0 ? (
    <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
      表示できる大会はありません
    </p>
  ) : (
    <ul className="space-y-2">
      {families.map((family) => (
        <li key={family}>
          <Link
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
            href={`/c/${family}`}
          >
            <span className="font-semibold capitalize text-slate-900">
              {family.replace(/-/g, " ")}
            </span>
            <span className="text-sm text-slate-500">全シーズン →</span>
          </Link>
        </li>
      ))}
    </ul>
  )}
</section>
```

### 変更後

```tsx
<section className="space-y-3">
  <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
    大会アーカイブ
  </h2>
  {families.length === 0 ? (
    <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-[var(--color-ink-muted)]">
      表示できる大会はありません
    </p>
  ) : (
    <ul className="grid gap-3 sm:grid-cols-2">
      {families.map((family) => (
        <li key={family}>
          <Link
            className="group flex h-full items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
            href={`/c/${family}`}
          >
            <span className="font-semibold capitalize text-[var(--color-ink)]">
              {family.replace(/-/g, " ")}
            </span>
            <span className="text-sm text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-ink)]">
              全シーズン →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )}
</section>
```

**変更のポイント:**
- `space-y-2` → `grid gap-3 sm:grid-cols-2`（グリッド化）
- 見出しスタイルをデザイントークンに統一
- カラーを `--color-ink` トークンに統一

---

## 完了条件

- [ ] ヒーローセクションがダーク背景（`var(--color-ink)`）で描画される
- [ ] ヒーロー内テキストが白く読める（アクセシビリティ contrast ratio 4.5:1 以上）
- [ ] 「最新シーズン」が縦長フィーチャーカードとして表示される
- [ ] 「大会アーカイブ」が sm 以上で 2 カラムグリッドになる（モバイルは 1 カラム）
- [ ] 外側 `<main>` の `bg-slate-50` 背景はそのまま維持
- [ ] `pnpm tsc --noEmit` がパスする
- [ ] `pnpm build` が成功する

## 変更しないこと

- ページのルーティング・データ取得ロジック（`listFamilies`、`getLatestCompetitionWithMatches` 等）
- `components/` 以下のファイル
- `app/globals.css` と `tailwind.config.ts`
