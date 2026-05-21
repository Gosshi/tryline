# PR #104 — コンテンツなしシーズンを大会ページで「準備中」表示にする（W7）

## 背景

`/c/six-nations` の「全シーズン」リストに "Six Nations 2027" が表示されるが、
クリックするとコンテンツ（AI プレビュー/レビュー）が0件のページに遷移してしまう。

原因: `listSeasonsByFamily` は `matches` テーブルのレコード数（`matchCount`）しか集計していない。
試合自体は登録されていても公開済み `match_content` がなければ、ユーザーには空のページが見える。

## スコープ

対象:
- `lib/db/queries/competitions.ts`
- `app/c/[competition]/page.tsx`

対象外:
- 個別シーズンページ（`/c/[competition]/[season]/page.tsx`）の変更なし
- データの削除・追加なし

---

## 変更仕様

### 1. `CompetitionRow` 型に `publishedContentCount` を追加 (`lib/db/queries/competitions.ts`)

```ts
// Before
export type CompetitionRow = {
  id: string;
  slug: string;
  family: string;
  matchCount: number;
  name: string;
  season: string;
  startDate: string | null;
  endDate: string | null;
};

// After
export type CompetitionRow = {
  id: string;
  slug: string;
  family: string;
  matchCount: number;
  publishedContentCount: number;
  name: string;
  season: string;
  startDate: string | null;
  endDate: string | null;
};
```

### 2. `listSeasonsByFamily` で公開済みコンテンツ数を集計

2クエリに分割して並列実行し、`competitionId` でマージする:

```ts
export async function listSeasonsByFamily(
  family: string,
): Promise<CompetitionRow[]> {
  const client = getSupabasePublicServerClient();

  const [seasonsResult, contentCountsResult] = await Promise.all([
    client
      .from("competitions")
      .select("id, slug, family, name, season, start_date, end_date, matches(count)")
      .eq("family", family)
      .order("season", { ascending: false }),
    client
      .from("match_content")
      .select("matches!inner(competition_id)", { count: "exact", head: false })
      .eq("status", "published"),
  ]);

  if (seasonsResult.error) throw seasonsResult.error;
  if (contentCountsResult.error) throw contentCountsResult.error;

  // competition_id ごとにカウント集計
  const countByCompetitionId = new Map<string, number>();
  for (const row of contentCountsResult.data ?? []) {
    const compId = (row.matches as { competition_id: string } | null)?.competition_id;
    if (compId) {
      countByCompetitionId.set(compId, (countByCompetitionId.get(compId) ?? 0) + 1);
    }
  }

  return ((seasonsResult.data ?? []) as CompetitionDbRow[]).map((row) => ({
    ...mapCompetitionRow(row),
    publishedContentCount: countByCompetitionId.get(row.id) ?? 0,
  }));
}
```

`mapCompetitionRow` の戻り値には `publishedContentCount: 0` をデフォルトとして追加する。

### 3. `selectLatestSeasonWithMatches` を更新

公開済みコンテンツがあるシーズンを優先的に選ぶ:

```ts
// Before
export function selectLatestSeasonWithMatches(
  seasons: CompetitionRow[],
): CompetitionRow | null {
  const withMatches = seasons.filter((season) => season.matchCount > 0);
  return withMatches[0] ?? seasons[0] ?? null;
}

// After
export function selectLatestSeasonWithMatches(
  seasons: CompetitionRow[],
): CompetitionRow | null {
  const withContent = seasons.filter((s) => s.publishedContentCount > 0);
  if (withContent.length > 0) return withContent[0];
  const withMatches = seasons.filter((s) => s.matchCount > 0);
  return withMatches[0] ?? seasons[0] ?? null;
}
```

### 4. 大会ハブページで「準備中」シーズンをグレーアウト表示 (`app/c/[competition]/page.tsx`)

「全シーズン」の `<ul>` 内で、`publishedContentCount === 0` のシーズンはリンクでなく
グレーのラベル + "準備中" バッジで表示する:

```tsx
{seasons.map((season) => {
  const hasContent = season.publishedContentCount > 0;
  return (
    <li key={season.slug}>
      {hasContent ? (
        <Link
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 transition-colors hover:border-slate-400 hover:bg-slate-50"
          href={`/c/${competition}/${season.season}`}
        >
          <span className="text-lg font-semibold text-slate-900">
            {season.season}
          </span>
          {season.startDate && season.endDate && (
            <span className="text-sm text-slate-500">
              {season.startDate.slice(0, 7)} 〜 {season.endDate.slice(0, 7)}
            </span>
          )}
        </Link>
      ) : (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 opacity-60">
          <span className="text-lg font-semibold text-slate-500">
            {season.season}
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            準備中
          </span>
        </div>
      )}
    </li>
  );
})}
```

---

## 完了の定義

- [ ] `/c/six-nations` の「全シーズン」に "2027" が「準備中」としてグレーアウト表示される
- [ ] "準備中" シーズンはリンクでない（クリックできない）
- [ ] "最新シーズン" カードは公開済みコンテンツがある最新シーズンを指す
- [ ] コンテンツがあるシーズン（2025 等）は従来通りリンクで表示される
- [ ] TypeScript エラーなし・`pnpm build` 通過
