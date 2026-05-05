# feat: トップページに「今後の試合」セクションを追加

## 目的

トップページに今後予定されている試合を最大 5 件表示し、
ユーザーが「次にいつ何の試合があるか」を JST で一目で把握できるようにする。

## 実装の流れ

### 1. 新クエリの追加

`lib/db/queries/matches.ts` に `getUpcomingMatches` 関数を追加する。
同ファイル内の既存 private 関数 `mapMatchRow` を利用すること。

`competitions` テーブルに `family` カラムがあるか確認すること。
ない場合は slug から導出する（`slug.replace(/-\d{4}(-\d{2})?$/, "")` で family を得られる）。

```ts
export type UpcomingMatch = MatchListItem & {
  competition: { slug: string; name: string; season: string };
};

export async function getUpcomingMatches(limit = 5): Promise<UpcomingMatch[]> {
  const client = getSupabasePublicServerClient();
  const now = new Date().toISOString();

  const { data, error } = await client
    .from("matches")
    .select(
      `
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
      `,
    )
    .eq("status", "scheduled")
    .gte("kickoff_at", now)
    .order("kickoff_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data
    .filter((row) => row.competition !== null)
    .map((row) => ({
      ...mapMatchRow(row),
      competition: row.competition!,
    }));
}
```

### 2. トップページへのセクション追加

`app/page.tsx`

```ts
import { getUpcomingMatches } from "@/lib/db/queries/matches";
import { formatKickoffJst } from "@/lib/format/kickoff";

const [families, latest, recentReviews, upcomingMatches] = await Promise.all([
  listFamilies(),
  getLatestCompetitionWithMatches(),
  getRecentlyReviewedMatches(3),
  getUpcomingMatches(5),
]);
```

「最新シーズン」セクションと「最近のレビュー」セクションの間に挿入する。
`upcomingMatches.length > 0` のときのみ表示する。

competition の表示名は、slug から family 部分を取り出して `formatFamilyName` に渡す。
`formatFamilyName` は `lib/format/competition.ts` に既に定義されている。

```tsx
{upcomingMatches.length > 0 && (
  <section className="space-y-3">
    <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
      今後の試合
    </h2>
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {upcomingMatches.map((match) => {
        const family = match.competition.slug.replace(/-\d{4}(-\d{2})?$/, "");
        return (
          <li key={match.id}>
            <Link
              className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50"
              href={`/matches/${match.id}`}
            >
              <div className="w-32 shrink-0">
                <time
                  className="text-xs font-semibold tabular-nums text-[var(--color-accent)]"
                  dateTime={match.kickoffAt}
                >
                  {formatKickoffJst(match.kickoffAt)}
                </time>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
                  {match.homeTeam.shortCode} vs {match.awayTeam.shortCode}
                </p>
                <p className="truncate text-xs text-[var(--color-ink-muted)]">
                  {formatFamilyName(family)}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  </section>
)}
```

## 変更するファイル

- `lib/db/queries/matches.ts` — `UpcomingMatch` 型と `getUpcomingMatches` 関数を追加
- `app/page.tsx` — `Promise.all` に追加 + 「今後の試合」セクションを描画

## 変更しないこと

- `components/match-card.tsx`
- `lib/db/queries/match-content.ts`

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm build` 成功
- トップページに「今後の試合」セクションが表示され、JST の日時・対戦チーム・大会名が確認できること
- scheduled の試合が 0 件の場合はセクション自体が非表示になること
- 各行クリックで試合詳細ページへ遷移すること

## ブランチ・PR

- ブランチ: `feat/homepage-upcoming-matches`
- PR タイトル: `Feat: add upcoming matches section to homepage`
