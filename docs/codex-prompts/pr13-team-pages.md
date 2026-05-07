# feat: チームページ `/t/[team]`

## 目的

チームスラグ別のページ（例: `/t/scotland`）を追加し、
そのチームの過去の試合結果・今後の試合を表示する。
チームファンが試合を追いやすくし、SEO 流入経路も増やす。

**必ず `design.md` を最初に読んでから実装すること。**

## 参照すべきファイル

- `lib/db/queries/matches.ts` — 既存クエリのパターンを踏襲する（`mapMatchRow` を再利用）
- `components/match-card.tsx` — 試合カードを再利用する
- `lib/db/queries/match-content.ts` — `getContentStatusMap`
- `lib/format/team-identity.ts` — `getTeamColor`
- `app/c/[competition]/[season]/page.tsx` — ページ構成の参考

## 実装

### 1. `lib/db/queries/matches.ts` に 2 関数を追加

```ts
export async function getTeamBySlug(
  teamSlug: string,
): Promise<{ slug: string; name: string; shortCode: string } | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("teams")
    .select("slug, name, short_code")
    .eq("slug", teamSlug)
    .single();
  if (error || !data) return null;
  return {
    slug: data.slug,
    name: data.name,
    shortCode: data.short_code ?? data.name.slice(0, 3).toUpperCase(),
  };
}

export type TeamPageMatch = MatchListItem & {
  competition: { slug: string; name: string; season: string };
};

export async function getMatchesByTeamSlug(
  teamSlug: string,
  limit = 30,
): Promise<{ past: TeamPageMatch[]; upcoming: TeamPageMatch[] }> {
  const client = getSupabasePublicServerClient();

  // チームの id を先に取得し、home_team_id / away_team_id で OR フィルタ
  const { data: teamRow } = await client
    .from("teams")
    .select("id")
    .eq("slug", teamSlug)
    .single();

  if (!teamRow) return { past: [], upcoming: [] };

  const { data, error } = await client
    .from("matches")
    .select(
      `id, kickoff_at, status, home_score, away_score, venue, external_ids,
       home_team:teams!matches_home_team_id_fkey (slug, name, short_code),
       away_team:teams!matches_away_team_id_fkey (slug, name, short_code),
       competition:competitions!matches_competition_id_fkey (slug, name, season)`,
    )
    .or(`home_team_id.eq.${teamRow.id},away_team_id.eq.${teamRow.id}`)
    .order("kickoff_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const now = new Date().toISOString();
  const rows = data
    .filter((r) => r.home_team && r.away_team && r.competition)
    .map((r) => ({ ...mapMatchRow(r), competition: r.competition! }));

  return {
    past: rows.filter((m) => m.status === "finished"),
    upcoming: rows
      .filter((m) => m.kickoffAt >= now)
      .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt)),
  };
}
```

### 2. `app/t/[team]/page.tsx` を新規作成

```tsx
import { notFound } from "next/navigation";

import { FlagIcon } from "@/components/flag-icon";
import { MatchCard } from "@/components/match-card";
import { getContentStatusMap } from "@/lib/db/queries/match-content";
import {
  getMatchesByTeamSlug,
  getTeamBySlug,
} from "@/lib/db/queries/matches";
import { getTeamColor } from "@/lib/format/team-identity";

import type { Metadata } from "next";

type Props = { params: Promise<{ team: string }> };

export const revalidate = 60;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { team } = await params;
  const teamData = await getTeamBySlug(team);
  if (!teamData) return { title: "Tryline" };
  return {
    title: `${teamData.name} — 試合一覧`,
    description: `${teamData.name} の試合結果・今後の試合・AI日本語レビュー。`,
    openGraph: {
      title: `${teamData.name} | Tryline`,
      description: `${teamData.name} の試合一覧。`,
      url: `https://tryline-six.vercel.app/t/${team}`,
      type: "website",
    },
  };
}

export default async function TeamPage({ params }: Props) {
  const { team } = await params;
  const [teamData, { past, upcoming }] = await Promise.all([
    getTeamBySlug(team),
    getMatchesByTeamSlug(team),
  ]);

  if (!teamData) notFound();

  const contentStatusMap = await getContentStatusMap(
    [...past, ...upcoming].map((m) => m.id),
  );
  const teamColor = getTeamColor(team);

  return (
    <main className="min-h-screen bg-slate-50">
      <div
        className="border-b border-slate-200 bg-white"
        style={{ borderTop: `4px solid ${teamColor}` }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-6 sm:px-6 md:px-8">
          <FlagIcon size={40} slug={team} />
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              {teamData.name}
            </h1>
            <p className="text-sm text-[var(--color-ink-muted)]">
              {teamData.shortCode}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6 sm:py-10 md:px-8">
        {upcoming.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              今後の試合
            </h2>
            <ul className="space-y-3">
              {upcoming.map((match) => (
                <li key={match.id}>
                  <MatchCard
                    contentStatus={contentStatusMap[match.id]}
                    match={match}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            過去の試合
          </h2>
          {past.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              試合データがありません
            </p>
          ) : (
            <ul className="space-y-3">
              {past.map((match) => (
                <li key={match.id}>
                  <MatchCard
                    contentStatus={contentStatusMap[match.id]}
                    match={match}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
```

## 変更・作成するファイル

- `lib/db/queries/matches.ts`（`getTeamBySlug`・`getMatchesByTeamSlug` を追加）
- `app/t/[team]/page.tsx`（新規作成）

## 変更しないこと

- `components/match-card.tsx` の既存インターフェース
- 既存ルート・クエリのロジック

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm build` 成功
- `/t/scotland` でスコットランドの試合一覧が表示されること
- 存在しないスラグで 404 になること
- OGP タグが設定されていること

## ブランチ・PR

- ブランチ: `feat/team-pages`
- PR タイトル: `Feat: add team pages at /t/[team]`
