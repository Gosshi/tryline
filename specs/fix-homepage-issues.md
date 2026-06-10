# fix-homepage-issues

## 背景

PMF 監査（2026-06-10）で発見されたホームページの3つの表示不具合。いずれも実装コストが低く、かつ訪問者の第一印象に直結する。

## スコープ

### Issue 1: Hero コピーの Top 14 過剰約束

`app/page.tsx` L194–198 のヒーロー本文が Top 14 と URC を同列に列挙しているが、Top 14 はイベントデータ未整備でレビュー品質が他大会より劣る。実態と乖離した説明は信頼を損なう。

**対象ファイル**: `app/page.tsx`

### Issue 2: 「今週の試合」と「今後の試合」の重複

- 「今週の試合」: 今週の未消化試合（最大6件）
- 「今後の試合」: `getUpcomingMatches(5)` の結果

`getUpcomingMatches` は今週の試合も含むため、今週に試合がある場合に両セクションで同じ試合が表示される。

**対象ファイル**: `app/page.tsx`

### Issue 3: 「最近のレビュー」の大会名が英語

`RECENTLY_REVIEWED_MATCH_SELECT` に `name_ja` が含まれていないため、`mapCompetitionRow` が `nameJa: null` を返す。ページ側が `match.competition.name`（英語の生文字列）を `formatCompetitionTitle` に渡しているため英語表示になる。

**対象ファイル**:
- `lib/db/queries/matches.ts`（`RECENTLY_REVIEWED_MATCH_SELECT` 定数）
- `app/page.tsx`（`formatCompetitionTitle` の呼び出し箇所）

## 対象外

- `getRecentlyReviewedFamilies` や他クエリの `name_ja` 対応（影響範囲を絞るため今回は上記のみ）
- URC・SRP のイベントデータ整備（別 spec: `feat-urc-srp-match-events.md`）
- Top 14 コンテンツ整備

## 変更詳細

### 1. Hero コピー変更（`app/page.tsx` L194–198）

```typescript
// Before
<p className="mt-5 max-w-xl text-base leading-relaxed text-white/60">
  DAZN、J SPORTS、WOWOW で見たい試合が重なる週末でも、 Six
  Nations、Premiership、URC、Top 14 まで試合の流れと見どころを
  日本語レビューと試合チャットで追えます。
</p>

// After
<p className="mt-5 max-w-xl text-base leading-relaxed text-white/60">
  DAZN、J SPORTS、WOWOW で見たい試合が重なる週末でも、Six
  Nations・Premiership・URC をはじめとする主要大会の試合の流れと見どころを
  日本語レビューと試合チャットで追えます。
</p>
```

### 2. 「今後の試合」から今週分を除外（`app/page.tsx`）

`upcomingMatches` と `homepageWeekMatches` を両方取得した後、重複を除いた `homepageUpcomingMatches` を作る:

```typescript
const homepageUpcomingMatches = upcomingMatches.filter(
  (match) => !homepageWeekMatches.some((wm) => wm.id === match.id),
);
```

JSX 側の `upcomingMatches.length > 0` チェックと `upcomingMatches.map(...)` を `homepageUpcomingMatches` に置き換える。

### 3. `RECENTLY_REVIEWED_MATCH_SELECT` に `name_ja` を追加（`lib/db/queries/matches.ts` L303–330）

```typescript
const RECENTLY_REVIEWED_MATCH_SELECT = `
  generated_at,
  content_md,
  match:matches!match_content_match_id_fkey (
    id,
    kickoff_at,
    status,
    home_score,
    away_score,
    venue,
    external_ids,
    home_team:teams!matches_home_team_id_fkey (
      slug,
      name,
      short_code
    ),
    away_team:teams!matches_away_team_id_fkey (
      slug,
      name,
      short_code
    ),
    competition:competitions!matches_competition_id_fkey (
      slug,
      name,
      name_ja,
      season
    )
  )
`;
```

型 `RecentlyReviewedContentRow` の competition にも `name_ja?: string | null` を追加する。

### 4. `app/page.tsx` の `formatCompetitionTitle` 呼び出しを object 渡しに変更

「最近のレビュー」セクション（L459–462 付近）:

```typescript
// Before
{formatCompetitionTitle(
  match.competition.name,
  match.competition.season,
)}

// After
{formatCompetitionTitle(
  match.competition,
  match.competition.season,
)}
```

`formatCompetitionTitle` は既に `CompetitionDisplayInput` 型を受け付けており、`nameJa` があれば日本語名を優先する実装済み。

同様に hero section の sample match カード（L237–240 付近）も object 渡しに変更する:

```typescript
// Before
{formatCompetitionTitle(
  sampleMatch.competition.name,
  sampleMatch.competition.season,
)}

// After
{formatCompetitionTitle(
  sampleMatch.competition,
  sampleMatch.competition.season,
)}
```

## 受け入れ条件

1. Hero コピーに「Top 14」が含まれない
2. 今週の試合がある場合、「今後の試合」セクションに同じ試合が重複して表示されない
3. 「最近のレビュー」カードの大会名が日本語で表示される（例: "Premiership" → "プレミアシップ"）
4. TypeScript strict エラーなし

## 未解決の質問

なし（実装開始可能）
