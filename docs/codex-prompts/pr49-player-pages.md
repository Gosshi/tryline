# PR49: 選手ページ（SEO）

## 背景

各選手の専用ページを作り、「[選手名] ラグビー スタッツ」「[選手名] 試合」等の検索キーワードで流入を増やす。
`match_lineups` に 411試合・1,911人分の出場データがあり、コンテンツの主体にできる。

## スコープ

対象:
- `supabase/migrations/` — `players` テーブルへの `slug` 追加
- `lib/db/queries/players.ts` — 新規作成
- `app/players/[slug]/page.tsx` — 新規作成
- `app/sitemap.ts` — 選手ページを追加

対象外:
- キャップ数・生年月日の表示（データ品質が不十分なため）
- 得点イベント一覧（`match_events.player_name` は文字列のみで `player_id` との紐付けがない）
- 選手写真

---

## 変更詳細

### 1. マイグレーション

#### 1-1. `players` テーブルに `slug` カラムを追加

```sql
ALTER TABLE players ADD COLUMN slug text;
```

#### 1-2. 既存データのスラグ生成

以下のルールで生成する:

1. `name` を小文字化
2. ASCII 英数字以外をハイフンに置換
3. 連続ハイフンは1つに正規化、先頭・末尾のハイフンを除去
4. 同一スラグが重複する場合は `{slug}-{team_slug}` で区別する

```sql
-- まず raw スラグを設定
UPDATE players
SET slug = regexp_replace(
  regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'),
  '^-|-$', '', 'g'
);

-- 重複スラグを team_slug サフィックスで解決
UPDATE players p
SET slug = p.slug || '-' || t.slug
FROM teams t
WHERE p.team_id = t.id
  AND (
    SELECT COUNT(*) FROM players p2 WHERE p2.slug = p.slug AND p2.id != p.id
  ) > 1;
```

> **注意**: フランス語などのアクセント文字（é, è, ô 等）はハイフンに変換される。
> 例: `Théo Attissogbé` → `th-o-attissogb-france`（重複時）。
> unaccent 拡張の有効化は後続 PR で対処する。

#### 1-3. UNIQUE 制約と NOT NULL 制約を追加

```sql
ALTER TABLE players
  ALTER COLUMN slug SET NOT NULL,
  ADD CONSTRAINT players_slug_key UNIQUE (slug);
```

---

### 2. `lib/db/queries/players.ts`（新規作成）

```typescript
import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type PlayerDetail = {
  id: string;
  name: string;
  slug: string;
  position: string | null;
  teamName: string;
  teamSlug: string;
};

export type PlayerMatchRow = {
  matchId: string;
  kickoffAt: string;
  status: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number | null;
  awayScore: number | null;
  competitionName: string;
  competitionSeason: string;
  competitionFamily: string;
  jerseyNumber: number;
  isStarter: boolean;
};

export async function getPlayerBySlug(
  slug: string,
): Promise<PlayerDetail | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("players")
    .select(
      "id, name, slug, position, team:teams!players_team_id_fkey(name, slug)",
    )
    .eq("slug", slug)
    .single();

  if (error || !data) return null;

  const team = data.team as { name: string; slug: string } | null;
  return {
    id: data.id,
    name: data.name,
    position: data.position ?? null,
    slug: data.slug,
    teamName: team?.name ?? "",
    teamSlug: team?.slug ?? "",
  };
}

export async function getMatchesForPlayer(
  playerId: string,
): Promise<PlayerMatchRow[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("match_lineups")
    .select(
      `
        jersey_number,
        is_starter,
        match:matches!match_lineups_match_id_fkey (
          id,
          kickoff_at,
          status,
          home_score,
          away_score,
          home_team:teams!matches_home_team_id_fkey ( name ),
          away_team:teams!matches_away_team_id_fkey ( name ),
          competition:competitions!matches_competition_id_fkey ( name, season, family )
        )
      `,
    )
    .eq("player_id", playerId)
    .order("match(kickoff_at)", { ascending: false })
    .limit(30);

  if (error || !data) return [];

  return data.map((row) => {
    const m = row.match as {
      id: string;
      kickoff_at: string;
      status: string;
      home_score: number | null;
      away_score: number | null;
      home_team: { name: string } | null;
      away_team: { name: string } | null;
      competition: { name: string; season: string; family: string } | null;
    } | null;

    return {
      awayScore: m?.away_score ?? null,
      awayTeamName: m?.away_team?.name ?? "",
      competitionFamily: m?.competition?.family ?? "",
      competitionName: m?.competition?.name ?? "",
      competitionSeason: m?.competition?.season ?? "",
      homeScore: m?.home_score ?? null,
      homeTeamName: m?.home_team?.name ?? "",
      isStarter: row.is_starter,
      jerseyNumber: row.jersey_number,
      kickoffAt: m?.kickoff_at ?? "",
      matchId: m?.id ?? "",
      status: m?.status ?? "",
    };
  });
}

export async function listAllPlayerSlugs(): Promise<string[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("players")
    .select("slug")
    .not("slug", "is", null);

  if (error || !data) return [];
  return data.map((p) => p.slug);
}
```

---

### 3. `app/players/[slug]/page.tsx`（新規作成）

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";

import {
  getPlayerBySlug,
  getMatchesForPlayer,
} from "@/lib/db/queries/players";
import { formatCompetitionTitle } from "@/lib/format/competition";

import type { Metadata } from "next";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const player = await getPlayerBySlug(slug);
  if (!player) return {};
  return {
    description: `${player.name}（${player.teamName}）の出場試合・スタッツ一覧。`,
    title: `${player.name} — ${player.teamName}`,
  };
}

export default async function PlayerPage({ params }: Props) {
  const { slug } = await params;
  const player = await getPlayerBySlug(slug);
  if (!player) notFound();

  const matches = await getMatchesForPlayer(player.id);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 sm:px-6 md:px-8">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)]">
            Player
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--color-ink)]">
            {player.name}
          </h1>
          <div className="flex flex-wrap gap-3 text-sm text-[var(--color-ink-muted)]">
            <Link
              className="hover:text-[var(--color-ink)] hover:underline"
              href={`/t/${player.teamSlug}`}
            >
              {player.teamName}
            </Link>
            {player.position && <span>{player.position}</span>}
          </div>
        </header>

        <section>
          <h2 className="mb-4 text-lg font-bold text-[var(--color-ink)]">
            出場試合
          </h2>
          {matches.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              出場試合のデータがありません。
            </p>
          ) : (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {matches.map((m) => (
                <Link
                  className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-slate-50"
                  href={`/matches/${m.matchId}`}
                  key={m.matchId}
                >
                  <span className="w-24 shrink-0 text-xs text-[var(--color-ink-muted)]">
                    {new Date(m.kickoffAt).toLocaleDateString("ja-JP", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                  <span className="flex-1 text-[var(--color-ink)]">
                    {m.homeTeamName} vs {m.awayTeamName}
                    {m.status === "finished" && m.homeScore !== null && (
                      <span className="ml-2 text-[var(--color-ink-muted)]">
                        {m.homeScore}–{m.awayScore}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--color-ink-muted)]">
                    {formatCompetitionTitle(
                      m.competitionName,
                      m.competitionSeason,
                    )}
                  </span>
                  {!m.isStarter && (
                    <span className="shrink-0 text-xs text-slate-400">
                      途中出場
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
```

---

### 4. `app/sitemap.ts` の更新

`listAllPlayerSlugs` をインポートして選手ページを追加する。

```typescript
import { listAllPlayerSlugs } from "@/lib/db/queries/players";

// Promise.all の中に listAllPlayerSlugs() を追加
const [families, matchIds, teams, playerSlugs] = await Promise.all([
  listFamilies(),
  listAllMatchIds(),
  listAllTeams(),
  listAllPlayerSlugs(),
]);

// playerPages を生成
const playerPages = playerSlugs.map((slug) => ({
  changeFrequency: "weekly" as const,
  lastModified: new Date(),
  priority: 0.5,
  url: `${base}/players/${slug}`,
}));

// return 配列に ...playerPages を追加
```

---

## 受け入れ条件

- `supabase/migrations/` に slug 追加マイグレーションが追加されている
- `https://www.trylinerugby.com/players/[slug]` にアクセスすると選手名・チーム・ポジション（あれば）・出場試合一覧が表示される
- 出場試合の各行が `/matches/[id]` へのリンクになっている
- チーム名が `/t/[team-slug]` へのリンクになっている
- 存在しない slug では 404 になる
- `sitemap.xml` に選手ページが含まれる
- `pnpm build` でエラーなし

## 参考ファイル

- `lib/db/queries/team-stats.ts` — クエリの書き方の参考
- `lib/db/queries/matches.ts` — Supabase クライアントの使い方参考
- `lib/format/competition.ts` — `formatCompetitionTitle` の使い方
- `app/sitemap.ts` — 現在の sitemap 構造（`listAllTeams` の追加パターン参照）
