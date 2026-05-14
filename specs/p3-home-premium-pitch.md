# ホーム Premium 訴求強化：サンプルレビュー抜粋の表示

## 背景

ホームページのヒーローには「Premium を始める ¥980/月」ボタンがあるが、
コンテンツ品質が先見えせず、クリック動機が弱い。
料金ページ (`/pricing`) は既にサンプルレビューを表示しているが、
多くのユーザーは料金ページまでたどり着かない。
ホームでコンテンツの価値を先見せすることでファネル最上流での動機付けを強化する。

## スコープ

- 対象: `app/page.tsx` — 未ログイン・無料ユーザー向け表示
- 対象外: Premium ユーザーの表示（条件分岐で除外）

## 変更内容

### データ取得

`HomePage` 内の `Promise.all` に `getRecentlyReviewedMatches(1)` を追加する。
（`app/pricing/page.tsx` と同じクエリ。`sampleMatch = sample[0]` として利用）

### UI 配置

`<FavoriteTeamsBanner />` の直後、`favoriteMatches` セクションの前に追加する。

表示条件: `profile?.subscription_status !== "premium"`（未ログイン含む）かつ `sampleMatch?.recapExcerpt` が存在する

```tsx
{profile?.subscription_status !== "premium" && sampleMatch?.recapExcerpt && (
  <section
    aria-labelledby="sample-heading"
    className="border-b border-slate-100 bg-white px-4 py-8 sm:px-6 md:px-8"
  >
    <div className="mx-auto max-w-6xl">
      <p
        className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]"
        id="sample-heading"
      >
        AI レビューのサンプル
      </p>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
        {formatCompetitionTitle(sampleMatch.competition.name, sampleMatch.competition.season)}
        {" / "}
        {sampleMatch.homeTeam.name} vs {sampleMatch.awayTeam.name}
      </p>
      <p className="mt-3 line-clamp-3 text-base leading-relaxed text-[var(--color-ink)]">
        {sampleMatch.recapExcerpt}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Link
          className="text-sm font-semibold text-[var(--color-accent)] hover:underline"
          href={`/matches/${sampleMatch.id}`}
        >
          続きを読む →
        </Link>
        <Link
          className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          href="/pricing"
        >
          Premium を始める — ¥980/月
        </Link>
      </div>
    </div>
  </section>
)}
```

## 変更ファイル

- `app/page.tsx`

## 受け入れ条件

- 未ログイン・無料ユーザーのホームページにサンプルレビュー抜粋が 3 行表示される
- Premium ユーザーにはこのセクションが表示されない
- `recapExcerpt` が空の場合はセクション全体を非表示にする
- `revalidate = 60` の既存設定はそのまま
- 既存の `recentReviews` フェッチとは別に `getRecentlyReviewedMatches(1)` を Promise.all に追加する
