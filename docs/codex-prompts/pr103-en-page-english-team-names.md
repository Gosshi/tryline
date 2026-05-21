# PR #103 — ENページに英語チーム名を表示（W1 + W3）

## 背景

英語版試合ページ（`/matches/:id/en`）で、チーム名が日本語（`teams.name`）のまま表示される。
`teams` テーブルに英語名フィールドがないため、MatchHeader・MatchEventsSection・MatchLineupsSection・
MatchContentSection の CTA がすべて日本語名になっている。

`english_name` カラムを追加し、ENページでは英語名（未登録の場合は日本語名にフォールバック）を表示する。

## スコープ

対象:
- `supabase/migrations/` (teams テーブルに english_name 追加)
- `lib/db/queries/matches.ts` (MatchDetail 型 + getMatchById の SELECT)
- `components/match-header.tsx`
- `components/match-content-section.tsx`
- `app/matches/[id]/en/page.tsx`

対象外:
- JA ページの挙動は変更しない
- 英語名のシードデータは本PRに含めない（後日 DB から手動で入力）

---

## 変更仕様

### 1. DB マイグレーション

```sql
ALTER TABLE teams ADD COLUMN IF NOT EXISTS english_name text;
```

ファイル: `supabase/migrations/<timestamp>_add_teams_english_name.sql`

### 2. `MatchDetail` 型を更新 (`lib/db/queries/matches.ts`)

`homeTeam` / `awayTeam` の型定義に `englishName` を追加:

```ts
// Before
homeTeam: { slug: string; name: string; shortCode: string };
awayTeam: { slug: string; name: string; shortCode: string };

// After
homeTeam: { slug: string; name: string; englishName: string | null; shortCode: string };
awayTeam: { slug: string; name: string; englishName: string | null; shortCode: string };
```

`getMatchById` で使われる Supabase SELECT に `english_name` を追加:
```
home_team:teams!matches_home_team_id_fkey (
  slug,
  name,
  english_name,
  short_code
),
away_team:teams!matches_away_team_id_fkey (
  slug,
  name,
  english_name,
  short_code
)
```

map 関数でフィールドを追加:
```ts
homeTeam: {
  englishName: row.home_team.english_name ?? null,
  name: row.home_team.name,
  shortCode: row.home_team.short_code ?? row.home_team.name.slice(0, 3).toUpperCase(),
  slug: row.home_team.slug,
},
```

`getMatchById` 以外のクエリ（`getRecentlyReviewedMatchesForFamily` 等）には
今回 `english_name` は追加しない（EN ページでは使わないため）。
それらのクエリが別の map 関数を使っている場合は `englishName: null` を追加して型を合わせる。

### 3. `MatchHeader` に表示名オーバーライドを追加 (`components/match-header.tsx`)

```ts
// Before
type MatchHeaderProps = {
  match: MatchDetail;
};

// After
type MatchHeaderProps = {
  match: MatchDetail;
  homeDisplayName?: string;
  awayDisplayName?: string;
};
```

コンポーネント内で `name` を使っている箇所（`TeamBlock` への `name` prop、SR 用 `<h1>`、
`buildYouTubeSearchUrl`）はすべて `homeDisplayName ?? match.homeTeam.name` / 
`awayDisplayName ?? match.awayTeam.name` に変更する。

### 4. `MatchContentSection` で `language="en"` 時に英語名を使用 (`components/match-content-section.tsx`)

line 57 の `matchTitle` 生成を変更:

```ts
// Before
matchTitle={`${match.homeTeam.name} vs ${match.awayTeam.name}`}

// After
matchTitle={
  language === "en"
    ? `${match.homeTeam.englishName ?? match.homeTeam.name} vs ${match.awayTeam.englishName ?? match.awayTeam.name}`
    : `${match.homeTeam.name} vs ${match.awayTeam.name}`
}
```

### 5. EN ページで英語名を使用 (`app/matches/[id]/en/page.tsx`)

ページの先頭（`generateMetadata` 内と `MatchEnglishPage` 内それぞれ）で display name を導出:

```ts
const homeDisplayName = match.homeTeam.englishName ?? match.homeTeam.name;
const awayDisplayName = match.awayTeam.englishName ?? match.awayTeam.name;
```

**generateMetadata の title**（line 49）:
```ts
const title = `${homeDisplayName} vs ${awayDisplayName} — ${competition}`;
```

**MatchHeader**:
```tsx
<MatchHeader
  match={match}
  homeDisplayName={homeDisplayName}
  awayDisplayName={awayDisplayName}
/>
```

**MatchEventsSection**（すでに string props を受け取る）:
```tsx
<MatchEventsSection
  awayTeamName={awayDisplayName}
  homeTeamName={homeDisplayName}
  {/* 他の props は変更なし */}
/>
```

**MatchLineupsSection**（すでに string props を受け取る）:
```tsx
<MatchLineupsSection
  awayTeamName={awayDisplayName}
  homeTeamName={homeDisplayName}
  {/* 他の props は変更なし */}
/>
```

`MatchContentSection` は `language="en"` を既に渡しているので呼び出し側の変更不要（手順 4 で対応済み）。

---

## 完了の定義

- [ ] `teams` テーブルに `english_name text` カラムが追加されている
- [ ] EN ページの MatchHeader にチームの英語名が表示される（未登録なら日本語名）
- [ ] EN ページの events・lineups セクションに英語名が表示される
- [ ] EN ページのコンテンツ CTA（matchTitle）に英語名が表示される
- [ ] JA ページの表示は変わらない
- [ ] TypeScript エラーなし・`pnpm build` 通過
