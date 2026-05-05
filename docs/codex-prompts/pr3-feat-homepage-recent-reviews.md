# feat: トップページに「最近レビューが公開された試合」セクションを追加

## 目的

トップページにレビュー公開済みの試合を最大 3 件表示し、
初訪問者が「どんな分析が読めるか」をすぐに確認できるようにする。

## 実装の流れ

### 1. 新クエリの追加

`lib/db/queries/matches.ts` に新関数を追加する。
同ファイル内の既存 private 関数 `mapMatchRow` を利用すること。

```ts
export type RecentlyReviewedMatch = MatchListItem & {
  competition: { slug: string; name: string; season: string };
  recapGeneratedAt: string;
};

export async function getRecentlyReviewedMatches(
  limit = 3,
): Promise<RecentlyReviewedMatch[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_content")
    .select(
      `
        generated_at,
        match:matches!match_content_match_id_fkey (
          id,
          kickoff_at,
          status,
          home_score,
          away_score,
          venue,
          external_ids,
          home_team:teams!matches_home_team_id_fkey (slug, name, short_code),
          away_team:teams!matches_away_team_id_fkey (slug, name, short_code),
          competition:competitions!matches_competition_id_fkey (slug, name, season)
        )
      `,
    )
    .eq("content_type", "recap")
    .eq("status", "published")
    .order("generated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data
    .filter((row) => row.match !== null)
    .map((row) => ({
      ...mapMatchRow(row.match!),
      competition: row.match!.competition!,
      recapGeneratedAt: row.generated_at,
    }));
}
```

### 2. トップページへのセクション追加

`app/page.tsx` の `Promise.all` に `getRecentlyReviewedMatches()` を追加する。

```ts
import { getRecentlyReviewedMatches } from "@/lib/db/queries/matches";

const [families, latest, recentReviews] = await Promise.all([
  listFamilies(),
  getLatestCompetitionWithMatches(),
  getRecentlyReviewedMatches(3),
]);
```

「最新シーズン」セクションと「大会アーカイブ」セクションの間に新セクションを挿入する。
`recentReviews.length > 0` のときのみ表示する。

```tsx
{recentReviews.length > 0 && (
  <section className="space-y-3">
    <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
      最近のレビュー
    </h2>
    <ul className="space-y-3">
      {recentReviews.map((match) => (
        <li key={match.id}>
          <Link
            className="group flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
            href={`/matches/${match.id}`}
          >
            <div className="min-w-0">
              <p className="text-xs text-[var(--color-ink-muted)]">
                {match.competition.name} {match.competition.season}
              </p>
              <p className="mt-0.5 truncate font-semibold text-[var(--color-ink)]">
                {match.homeTeam.name} {match.homeScore} – {match.awayScore}{" "}
                {match.awayTeam.name}
              </p>
            </div>
            <span className="shrink-0 text-sm text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-ink)]">
              レビューを読む →
            </span>
          </Link>
        </li>
      ))}
    </ul>
  </section>
)}
```

## 変更するファイル

- `lib/db/queries/matches.ts` — `RecentlyReviewedMatch` 型と `getRecentlyReviewedMatches` 関数を追加
- `app/page.tsx` — `Promise.all` に追加 + 新セクションを描画

## 変更しないこと

- `components/match-card.tsx`（トップページでは独自レイアウトで表示）
- `lib/db/queries/match-content.ts`

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm build` 成功
- トップページに「最近のレビュー」セクションが表示され、各行をクリックすると試合詳細ページへ遷移すること
- レビューが 0 件の場合はセクション自体が非表示になること

## ブランチ・PR

- ブランチ: `feat/homepage-recent-reviews`
- PR タイトル: `Feat: add recent reviews section to homepage`
