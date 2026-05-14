# p3-competition-hub-improvement: 大会ハブページ強化

## 背景

`/c/{family}` の大会ハブページ（`app/c/[competition]/page.tsx`）は
ヒーロー画像 + シーズン一覧のみで、コンテンツがほぼない。
最新シーズンへの CTA と直近のレビュー済み試合を追加することで、
ハブページからシーズンページへの回遊を促す。

## スコープ

対象:
- `app/c/[competition]/page.tsx` の拡充
- 最新シーズンへのメイン CTA カードを追加
- 直近のレビュー済み試合（最大 3 件）を新セクションとして表示

対象外:
- 大会の説明文・歴史コンテンツの追加（コンテンツ管理コストが高いため対象外）
- 順位表・統計のハブページへの表示
- ヒーロー画像の変更

## データモデル変更

なし。既存クエリの組み合わせで実現する。

## API サーフェス

新規クエリを `lib/db/queries/matches.ts` に追加:

```ts
export async function getRecentlyReviewedMatchesForFamily(
  family: string,
  limit: number = 3,
): Promise<MatchListItem[]>
```

内部実装:
- `competitions` テーブルで `family = family` に一致する competition を取得
- それらの competition に属する matches のうち、`match_content` に
  `type = 'recap'` かつ `status = 'published'` のレコードがある試合を絞り込む
- `matches.kickoff_at DESC` でソートして `limit` 件取得
- 既存の `MatchListItem` 型を返す

## UI サーフェス

### 変更後のページ構成（上から順）

```
[ヒーロー画像（既存）]

[最新シーズンへの CTA カード]  ← 新規追加
  Premiership 2025-26 →

[最近のレビュー]  ← 新規追加（レビューがなければ非表示）
  MatchCard × 3

[全シーズン一覧（既存）]
```

#### 最新シーズン CTA カード

ホームページ（`app/page.tsx`）の「最新シーズン」カードと同じスタイルにする。

```tsx
<Link href={`/c/${competition}/${latestSeason.season}`}>
  <div className="group rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-slate-300">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
      最新シーズン
    </p>
    <p className="mt-2 font-serif text-3xl font-bold text-[var(--color-ink)]">
      {formatCompetitionTitle(latestSeason.name, latestSeason.season)}
    </p>
    <p className="mt-4 text-sm text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-ink)]">
      試合一覧を見る →
    </p>
  </div>
</Link>
```

#### 最近のレビューセクション

レビューが 1 件以上ある場合のみ表示。

```tsx
{recentReviews.length > 0 && (
  <section className="space-y-3">
    <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
      最近のレビュー
    </h2>
    <div className="grid gap-4 md:grid-cols-2">
      {recentReviews.map((match) => (
        <MatchCard key={match.id} match={match} />
      ))}
    </div>
  </section>
)}
```

## 受け入れ条件

- [ ] `/c/urc` などハブページに「最新シーズン」CTA カードが表示される
- [ ] レビューがある大会では「最近のレビュー」セクションに試合カードが表示される
- [ ] レビューがない大会では「最近のレビュー」セクションが非表示になる
- [ ] 全シーズン一覧は変更せず最下部に表示される
- [ ] `getRecentlyReviewedMatchesForFamily` が追加され型エラーがない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

- 最近のレビューの表示件数: 3 件で十分か（大会によっては 2 件しかないケースも想定）
