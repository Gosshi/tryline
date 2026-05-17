# PR50: canonical_player_id 導入 + ラインナップから選手ページへのリンク追加

## 背景

`players` テーブルは `(team_id, name)` がユニーク制約のため、
リーグワンと代表に掛け持ちする選手（Sam Cane、Jesse Kriel 等 115人）が
複数レコードに分断される。

本 PR では `canonical_player_id` パターンで同一人物を統合し、
試合詳細ページのラインナップから選手ページへのリンクを追加する。

## スコープ

対象:
- `supabase/migrations/` — `canonical_player_id` 追加 + 自動マージ
- `lib/db/queries/players.ts` — canonical 対応のクエリ更新
- `lib/db/queries/match-lineups.ts` — canonical slug を取得
- `components/match-lineups-section.tsx` — 選手名をリンク化
- `app/players/[slug]/page.tsx` — 非 canonical へのリダイレクト追加

対象外:
- `lib/db/queries/team-stats.ts`（トップスコアラーのリンク化）

---

## 変更詳細

### 1. マイグレーション

ファイル名: `supabase/migrations/20260517030000_add_canonical_player_id.sql`

```sql
-- canonical_player_id を追加（NULL = このレコード自体が canonical）
ALTER TABLE players
  ADD COLUMN canonical_player_id uuid REFERENCES players(id) ON DELETE SET NULL;

-- 同名選手のうち match_lineups 出場数が最多のものを canonical に選出し、
-- 残りに canonical_player_id をセット
WITH ranked AS (
  SELECT
    p.id,
    p.name,
    COUNT(ml.id) AS lineup_count,
    ROW_NUMBER() OVER (
      PARTITION BY p.name
      ORDER BY COUNT(ml.id) DESC, p.created_at ASC
    ) AS rn
  FROM players p
  LEFT JOIN match_lineups ml ON ml.player_id = p.id
  GROUP BY p.id, p.name
),
dupes AS (
  SELECT name FROM ranked GROUP BY name HAVING COUNT(*) > 1
),
canonical_ids AS (
  SELECT id AS canonical_id, name
  FROM ranked
  WHERE rn = 1 AND name IN (SELECT name FROM dupes)
)
UPDATE players p
SET canonical_player_id = c.canonical_id
FROM canonical_ids c
WHERE p.name = c.name
  AND p.id != c.canonical_id;

-- canonical の slug は既存のまま維持
-- 非 canonical の slug は変更不要（リダイレクト元として使うため）
```

---

### 2. `lib/db/queries/players.ts`

#### 2-1. `getPlayerBySlug` — canonical へのリダイレクト対応

```typescript
export type PlayerDetail = {
  id: string;
  name: string;
  slug: string;
  position: string | null;
  teamName: string;
  teamSlug: string;
  canonicalSlug: string | null; // null = このページが canonical
};

export async function getPlayerBySlug(
  slug: string,
): Promise<PlayerDetail | null> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("players")
    .select(
      `
        id, name, slug, position,
        team:teams!players_team_id_fkey ( name, slug ),
        canonical:players!players_canonical_player_id_fkey ( slug )
      `,
    )
    .eq("slug", slug)
    .single();

  if (error || !data) return null;

  const team = data.team as { name: string; slug: string } | null;
  const canonical = data.canonical as { slug: string } | null;

  return {
    canonicalSlug: canonical?.slug ?? null,
    id: data.id,
    name: data.name,
    position: data.position ?? null,
    slug: data.slug,
    teamName: team?.name ?? "",
    teamSlug: team?.slug ?? "",
  };
}
```

#### 2-2. `getMatchesForPlayer` — canonical + alias 両方の出場試合を取得

```typescript
export async function getMatchesForPlayer(
  playerId: string,
): Promise<PlayerMatchRow[]> {
  const client = getSupabasePublicServerClient();

  // canonical 自身のID + このIDを canonical とする alias のID を全て取得
  const { data: aliases } = await client
    .from("players")
    .select("id")
    .or(`id.eq.${playerId},canonical_player_id.eq.${playerId}`);

  const playerIds = (aliases ?? []).map((a) => (a as { id: string }).id);

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
    .in("player_id", playerIds)
    .order("match(kickoff_at)", { ascending: false })
    .limit(50);

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
```

#### 2-3. `listAllPlayerSlugs` — canonical のみ返す

```typescript
export async function listAllPlayerSlugs(): Promise<string[]> {
  const client = getSupabasePublicServerClient();
  const { data, error } = await client
    .from("players")
    .select("slug")
    .is("canonical_player_id", null) // canonical のみ
    .not("slug", "is", null);

  if (error || !data) return [];
  return data.map((p) => p.slug);
}
```

---

### 3. `app/players/[slug]/page.tsx`

非 canonical スラグでアクセスした場合、canonical ページへリダイレクトする。

```typescript
import { redirect } from "next/navigation";

export default async function PlayerPage({ params }: Props) {
  const { slug } = await params;
  const player = await getPlayerBySlug(slug);
  if (!player) notFound();

  // 非 canonical → canonical へリダイレクト
  if (player.canonicalSlug) {
    redirect(`/players/${player.canonicalSlug}`);
  }

  const matches = await getMatchesForPlayer(player.id);
  // ... 既存の JSX
}
```

`generateMetadata` にも同様のガードを追加する:

```typescript
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const player = await getPlayerBySlug(slug);
  if (!player || player.canonicalSlug) return {};
  // ...
}
```

---

### 4. `lib/db/queries/match-lineups.ts`

#### 4-1. `MatchLineupPlayer` 型に `playerSlug` を追加

```typescript
export type MatchLineupPlayer = {
  jerseyNumber: number;
  isStarter: boolean;
  playerName: string;
  playerSlug: string | null;
  position: string | null;
  teamId: string;
};
```

#### 4-2. クエリで canonical slug を取得

canonical_player_id がある場合は canonical の slug を、ない場合は自身の slug を使う。

```typescript
player:players!match_lineups_player_id_fkey (
  name,
  position,
  slug,
  canonical:players!players_canonical_player_id_fkey ( slug )
)
```

#### 4-3. マッピング — effective slug を計算

```typescript
const player = row.player as {
  name: string;
  position?: string | null;
  slug?: string | null;
  canonical?: { slug: string } | null;
} | null;

return {
  isStarter: row.is_starter,
  jerseyNumber: row.jersey_number,
  playerName: player?.name ?? "—",
  playerSlug: player?.canonical?.slug ?? player?.slug ?? null,
  position: player?.position ?? null,
  teamId: row.team_id,
};
```

---

### 5. `components/match-lineups-section.tsx`

`next/link` をインポートし、`playerSlug` がある場合のみ `<Link>` でラップする。

```tsx
import Link from "next/link";

// PlayerRow の選手名部分を以下に置き換える
<span className={isBench ? "min-w-0 text-sm text-slate-500" : "min-w-0 text-sm text-slate-700"}>
  {player.playerSlug ? (
    <Link className="truncate hover:underline" href={`/players/${player.playerSlug}`}>
      {player.playerName}
    </Link>
  ) : (
    <span className="truncate">{player.playerName}</span>
  )}
  {player.position && (
    <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
      {player.position}
    </span>
  )}
</span>
```

---

## 受け入れ条件

- マイグレーション適用後、同名選手 115件に `canonical_player_id` がセットされている
- canonical 選手ページ（`/players/sam-cane` 等）で、リーグワンと代表両方の出場試合が表示される
- 非 canonical スラグ（`/players/sam-cane-tokyo-suntory-sungoliath` 等）にアクセスすると canonical ページへリダイレクトされる
- サイトマップに non-canonical の slug が含まれない
- 試合詳細ページのラインナップで選手名がリンクになっている（リンク先は canonical ページ）
- `pnpm build` でエラーなし

## 参考ファイル

- `lib/db/queries/players.ts` — PR49 で作成済み（今回全面更新）
- `lib/db/queries/match-lineups.ts` — 変更対象
- `components/match-lineups-section.tsx` — 変更対象（`PlayerRow`、83行目付近）
- `app/players/[slug]/page.tsx` — PR49 で作成済み（リダイレクト追加）
