# feat-rwc2027-pool-info: RWC 2027 試合ページにプール情報を表示

## 背景

RWC 2027（Rugby World Cup 2027、`rwc-2027`）の試合は 36 件すべてが `status = "scheduled"` で、各試合の `external_ids` JSON に `pool_name`（例: `"Pool D"`）が入っている。しかし現在の試合ページには内容がなく、Google に「スコットランド 対 ポルトガル」など空のページとして認識されて CTR を損失している。

最小限の対応として、RWC 2027 のスケジュール済み試合ページに「同プールの参加チーム」を表示する。

---

## 実装方針

### 概要

1. `MatchListItem` 型に `poolName: string | null` を追加し、`mapMatchRow` で `external_ids.pool_name` から抽出する
2. 新クエリ `getPoolTeamsForMatch(competitionSlug, poolName)` を追加 — matches テーブルから同大会・同プールの全試合を取得し、ユニークなチームリストを返す
3. 試合ページ（`app/matches/[id]/page.tsx`）で、RWC スケジュール済み試合のみプールセクションを表示する
4. meta description にプール情報を付加してインデックス価値を高める

---

## Task 1 — 型追加 + `mapMatchRow` 変更

### ファイル: `lib/db/queries/matches.ts`

#### 1-A. `MatchListItem` 型に `poolName` を追加

```typescript
export type MatchListItem = {
  // ... 既存フィールド
  poolName: string | null;  // ← 追加
};
```

#### 1-B. `mapMatchRow` 内で抽出

`getRoundNameFromExternalIds` の直下に以下を追加する。

```typescript
function getPoolNameFromExternalIds(externalIds: Json): string | null {
  if (
    !externalIds ||
    typeof externalIds !== "object" ||
    Array.isArray(externalIds)
  ) {
    return null;
  }

  const poolName = (externalIds as Record<string, unknown>).pool_name;
  return typeof poolName === "string" ? poolName : null;
}
```

`mapMatchRow` のリターン値に追加する。

```typescript
return {
  // ... 既存フィールド
  poolName: getPoolNameFromExternalIds(row.external_ids),
};
```

---

## Task 2 — 新クエリ `getPoolTeamsForMatch`

### ファイル: `lib/db/queries/matches.ts`

`competition_pools` テーブルへの依存を避け、matches テーブルから同大会・同プールのユニークチームを収集する。

```typescript
export type PoolTeam = {
  name: string;
  slug: string;
  nameJa: string | null;
};

export async function getPoolTeamsForMatch(
  competitionSlug: string,
  poolName: string,
): Promise<PoolTeam[]> {
  const client = getSupabasePublicServerClient();

  const { data: competition, error: compError } = await client
    .from("competitions")
    .select("id")
    .eq("slug", competitionSlug)
    .maybeSingle();

  if (compError) throw compError;
  if (!competition) return [];

  const { data, error } = await client
    .from("matches")
    .select(
      `
        home_team:teams!matches_home_team_id_fkey (slug, name, name_ja),
        away_team:teams!matches_away_team_id_fkey (slug, name, name_ja)
      `,
    )
    .eq("competition_id", competition.id)
    .filter("external_ids->>pool_name", "eq", poolName);

  if (error) throw error;

  const seen = new Set<string>();
  const teams: PoolTeam[] = [];

  for (const row of (data ?? []) as Array<{
    home_team: { slug: string; name: string; name_ja: string | null } | null;
    away_team: { slug: string; name: string; name_ja: string | null } | null;
  }>) {
    for (const team of [row.home_team, row.away_team]) {
      if (team && !seen.has(team.slug)) {
        seen.add(team.slug);
        teams.push({
          name: getTeamDisplayName({ name: team.name, slug: team.slug }),
          nameJa: team.name_ja ?? null,
          slug: team.slug,
        });
      }
    }
  }

  return teams.sort((a, b) => a.name.localeCompare(b.name));
}
```

---

## Task 3 — 試合ページにプールセクションを追加

### ファイル: `app/matches/[id]/page.tsx`

#### 3-A. `getPoolTeamsForMatch` のインポートを追加

```typescript
import {
  // ...既存インポート
  getPoolTeamsForMatch,
} from "@/lib/db/queries/matches";
```

#### 3-B. プールチームの取得

`MatchDetailPage` の既存の第 2 段階 `Promise.all` の直後に条件付きで追加する。

```typescript
// 既存 (第2段階):
const [headToHeadCount, englishContent, standings] = await Promise.all([
  countHeadToHeadMatches(match.homeTeam.slug, match.awayTeam.slug),
  getMatchContentEn(id),
  getStandingsForCompetition(match.competition.slug),
]);

// 追加 — 条件フェッチ:
const isScheduledPoolMatch =
  match.status === "scheduled" &&
  match.competition.family === "rwc" &&
  match.poolName !== null;

const poolTeams = isScheduledPoolMatch
  ? await getPoolTeamsForMatch(match.competition.slug, match.poolName!)
  : [];
```

#### 3-C. meta description を改善

`description` 変数の最後の else 分岐（現在 `"${match.homeTeam.name} vs ${match.awayTeam.name} の試合結果・日本語レビュー。"`）を以下に差し替える。

```typescript
const description =
  match.status === "finished" && publishedContent.recap
    ? extractCoreSection(publishedContent.recap.contentMdJa)
    : match.status === "finished" && match.homeScore !== null && match.awayScore !== null
      ? `${match.homeTeam.name} ${match.homeScore}–${match.awayScore} ${match.awayTeam.name}（${competitionTitle}）の試合結果・日本語レビュー。`
      : publishedContent.preview
        ? extractDescription(publishedContent.preview.contentMdJa)
        : isScheduledPoolMatch && poolTeams.length > 0
          ? `${match.homeTeam.name} vs ${match.awayTeam.name}（${competitionTitle} ${match.poolName}）の試合情報。同プール: ${poolTeams.map((t) => t.name).join("、")}。`
          : `${match.homeTeam.name} vs ${match.awayTeam.name} の試合情報。${competitionTitle}。`;
```

#### 3-D. プールセクションの表示

`{match.status !== "finished" && ...}` の preview セクションの直後に追加する。

```tsx
{isScheduledPoolMatch && poolTeams.length > 0 && (
  <section
    aria-labelledby="pool-info-heading"
    className="rounded-[var(--radius-md)] bg-white p-5 shadow-[var(--shadow-soft)]"
  >
    <h2
      className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]"
      id="pool-info-heading"
    >
      {match.poolName} 参加チーム
    </h2>
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {poolTeams.map((team) => (
        <li key={team.slug}>
          <a
            className="block rounded-lg border border-[var(--color-border)] px-3 py-2 text-center text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            href={`/teams/${team.slug}`}
          >
            {team.name}
          </a>
        </li>
      ))}
    </ul>
  </section>
)}
```

---

## 完了条件

- [ ] `https://www.trylinerugby.com/matches/798581f9-4c5a-4245-b5b7-6cf448bc26a9`（スコットランド vs ポルトガル）を開くと「Pool D 参加チーム」セクションが表示される
- [ ] Pool D の 4 チーム（Scotland・Ireland・Uruguay・Portugal の日本語名）がリンク付きで表示される
- [ ] meta description に `"Rugby World Cup 2027 Pool D"` の情報が含まれる
- [ ] 既存の finished 試合ページに変化なし（プールセクション非表示）
- [ ] Nations Championship・Six Nations 等の他大会試合ページに変化なし
- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス

## 変更するファイル

- `lib/db/queries/matches.ts` — 型追加、`mapMatchRow` 変更、新クエリ追加
- `app/matches/[id]/page.tsx` — プールセクション表示ロジック

## ブランチ・PR

- ブランチ: `feat/rwc2027-pool-info`
- PR タイトル: `Feat: RWC 2027 match pages show pool teams`

## 変更しないこと

- `lib/db/queries/standings.ts`（`getPoolStandingsForCompetition` は手つかず）
- `supabase/migrations/` — DB マイグレーション不要
- 英語ルート（`app/matches/[id]/en/page.tsx`）— 今回は日本語ページのみ対応
