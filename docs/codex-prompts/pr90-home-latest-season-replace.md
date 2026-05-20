# PR #90 — ホーム「最新シーズン」セクション → 「最近レビューのある大会」へ変更

## 背景

ホームページの「最新シーズン」カードは `getLatestCompetitionWithMatches()` で
「直近に試合が終わった大会」を取得して表示しているが、
現在 URC 2025-26 を表示しており、このシーズンは未来試合のみで
**レビューが1件も存在しない**。結果として大きなカードがあるのにコンテンツが空洞化している。

また「最新シーズン」という見出しは「最近のレビュー」セクションと意味が重複しており、
情報設計として冗長。

## スコープ

対象:
- `app/page.tsx`
- `lib/db/queries/matches.ts`（新規クエリ追加）

対象外:
- `lib/db/queries/competitions.ts` — 変更不要

---

## 変更仕様

### 1. 新規クエリ `getRecentlyReviewedFamilies` を追加

`lib/db/queries/matches.ts` に以下を追加する。
「直近にレビューが公開された大会 family」を最大4件、重複なしで返す。

```ts
export type ReviewedFamily = {
  family: string;
  competitionName: string;
  competitionSeason: string;
  competitionSlug: string;
  latestReviewAt: string;
};

export async function getRecentlyReviewedFamilies(
  limit = 4,
): Promise<ReviewedFamily[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_content")
    .select(
      `
        generated_at,
        match:matches!match_content_match_id_fkey (
          competition:competitions!matches_competition_id_fkey (
            slug,
            name,
            season,
            family
          )
        )
      `,
    )
    .eq("content_type", "recap")
    .eq("language", "ja")
    .eq("status", "published")
    .order("generated_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  const seen = new Set<string>();
  const result: ReviewedFamily[] = [];

  for (const row of data ?? []) {
    const comp = (row.match as { competition?: { slug: string; name: string; season: string; family: string } } | null)?.competition;
    if (!comp) continue;
    if (seen.has(comp.family)) continue;

    seen.add(comp.family);
    result.push({
      competitionName: comp.name,
      competitionSeason: comp.season,
      competitionSlug: comp.slug,
      family: comp.family,
      latestReviewAt: row.generated_at,
    });

    if (result.length >= limit) break;
  }

  return result;
}
```

### 2. `app/page.tsx` の「最新シーズン」セクションを置き換える

#### データ取得

`Promise.all` に `getRecentlyReviewedFamilies()` を追加し、
`getLatestCompetitionWithMatches()` と直後の `getCompetitionBySlug()` を削除する。

```ts
import {
  getRecentlyReviewedFamilies,
  // getLatestCompetitionWithMatches を削除
  getRecentlyReviewedMatches,
  getUpcomingMatches,
  getFavoriteTeamMatches,
} from "@/lib/db/queries/matches";

const [
  families,
  reviewedFamilies,
  recentReviews,
  sampleReviews,
  upcomingMatches,
  favoriteMatches,
] = await Promise.all([
  listFamilies(),
  getRecentlyReviewedFamilies(4),
  getRecentlyReviewedMatches(3),
  getRecentlyReviewedMatches(1),
  getUpcomingMatches(5),
  getFavoriteTeamMatches(favoriteTeamSlugs),
]);

// 以下の2行も削除
// const latestCompetition = latest ? await getCompetitionBySlug(latest.slug) : null;
```

#### ヒーローの「試合を見る」リンク

`latestCompetition` を参照している `page.tsx:153` を `reviewedFamilies[0]` に変更:

```tsx
href={
  reviewedFamilies[0]
    ? `/c/${reviewedFamilies[0].family}/${reviewedFamilies[0].competitionSeason}`
    : "/"
}
```

#### セクション置き換え

「最新シーズン」の `<section>` ブロック（`page.tsx:248〜276`）を削除し、
以下に置き換える。`大会アーカイブ` セクションの直前に配置する。

```tsx
{reviewedFamilies.length > 0 && (
  <section>
    <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
      最近レビューのある大会
    </h2>
    <ul className="grid gap-3 sm:grid-cols-2">
      {reviewedFamilies.map((item) => (
        <li key={item.family}>
          <Link
            className="group flex h-full items-center justify-between rounded-xl border border-slate-200 bg-white py-4 pl-4 pr-5 transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
            href={`/c/${item.family}/${item.competitionSeason}`}
            style={{
              borderLeftColor: getCompetitionFamilyColor(item.family),
              borderLeftWidth: "4px",
            }}
          >
            <div>
              <span className="block font-semibold text-[var(--color-ink)]">
                {formatFamilyName(item.family)}
              </span>
              <span className="mt-0.5 block text-xs text-[var(--color-ink-muted)]">
                {item.competitionSeason}
              </span>
            </div>
            <span className="text-sm text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-ink)]">
              →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  </section>
)}
```

`getCompetitionFamilyColor` と `formatFamilyName` は既存 import で利用可能。

---

## 完了の定義

- [ ] ホームの「最新シーズン」が「最近レビューのある大会」グリッドに変わる
- [ ] 表示される大会はすべてレビューが1件以上存在する
- [ ] ヒーローの「試合を見る」ボタンが正しい大会ページに遷移する
- [ ] `getLatestCompetitionWithMatches` と `getCompetitionBySlug` の呼び出しが
      `app/page.tsx` から削除される
- [ ] TypeScript エラーなし・`pnpm build` 通過
