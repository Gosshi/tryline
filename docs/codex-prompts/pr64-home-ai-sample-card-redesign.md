# PR #64 — ホームの AI サンプルブロックを記事カード風にリデザイン

## 背景

ホームページの「AI レビューのサンプル」セクションは現在プレーンなテキストボックスで、
試合名と本文が並んでいるだけ。コンテンツの価値（AI が書いた日本語分析）が
視覚的に伝わらず、Premium CTA につながりにくい。
「雑誌・スポーツメディア風のカード」にリデザインして、コンテンツの質感を演出する。

## スコープ

対象:
- `app/page.tsx` — `aria-labelledby="sample-heading"` の region 要素（行 198〜234 付近）

対象外:
- DB クエリ・データ取得ロジックは変更しない
- `sampleMatch` の型・構造は変更しない

## 現在の構造（変更前）

```tsx
<section aria-labelledby="sample-heading" ...>
  <p>AI レビューのサンプル</p>
  <p>{competition} {homeTeam} vs {awayTeam}</p>
  <p>{recapExcerpt}</p>
  <Link href={matchUrl}>全文を読む</Link>
  <Link href="/pricing">Premium を登録</Link>
</section>
```

## 変更後のデザイン仕様

スポーツメディア風の引用カード。左側に緑のアクセントボーダー、
背景は少し暗くして「コンテンツ区画」感を出す。

```tsx
<section
  aria-labelledby="sample-heading"
  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
>
  {/* ヘッダー帯 */}
  <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3">
    <p
      id="sample-heading"
      className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]"
    >
      AI レビューのサンプル
    </p>
    <span className="rounded-full bg-[var(--color-accent)]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent)]">
      Premium
    </span>
  </div>

  {/* 試合名 */}
  <div className="border-b border-slate-100 px-5 py-3">
    <p className="text-xs text-[var(--color-ink-muted)]">
      {formatCompetitionTitle(sampleMatch.competition.name, sampleMatch.competition.season)}
    </p>
    <p className="mt-0.5 text-sm font-bold text-[var(--color-ink)]">
      {sampleMatch.homeTeam.name} vs {sampleMatch.awayTeam.name}
    </p>
  </div>

  {/* 本文（左ボーダーアクセント） */}
  <div className="mx-5 my-4 border-l-4 border-[var(--color-accent)] pl-4">
    <p className="line-clamp-5 text-sm leading-relaxed text-[var(--color-ink)]">
      {sampleMatch.recapExcerpt}
    </p>
  </div>

  {/* フッター CTA */}
  <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-4">
    <Link
      href={`/matches/${sampleMatch.id}`}
      className="text-xs font-semibold text-[var(--color-accent)] hover:underline"
    >
      この試合を見る →
    </Link>
    <Link
      href="/pricing"
      className="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-xs font-bold text-white hover:opacity-90"
    >
      Premium を登録 — ¥980/月
    </Link>
  </div>
</section>
```

### デザインのポイント

- 左側の緑ボーダー (`border-l-4 border-[var(--color-accent)]`) で「引用・分析コンテンツ」感を演出
- `line-clamp-5` で本文を5行に収め、続きを読みたくさせる
- ヘッダー帯に「Premium」バッジを配置して有料コンテンツの価値を強調
- 既存の `formatCompetitionTitle` を流用する（import 済みのはず）

## 完了の定義

- [ ] ホームページの AI サンプルセクションがヘッダー帯・試合名・左ボーダー付き本文・フッター CTA の構造で表示される
- [ ] 本文が5行でトランケートされる
- [ ] 「この試合を見る」と「Premium を登録」の2つの CTA が表示される
- [ ] モバイル（375px）でレイアウトが崩れない
- [ ] TypeScript エラーなし・`pnpm build` 通過
