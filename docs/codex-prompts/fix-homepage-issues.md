# Codex プロンプト: ホームページ3件の表示修正

仕様: `specs/fix-homepage-issues.md` を参照。

## タスク

ホームページの以下3件をまとめて修正する。

1. Hero コピーから「Top 14」を削除し実態に合った文言に変更
2. 「今後の試合」セクションから「今週の試合」と重複する試合を除外
3. 「最近のレビュー」カードの大会名を日本語化

## 変更ファイルと内容

### 1) `app/page.tsx` — Hero コピー（L194–198 付近）

`<p className="mt-5 max-w-xl ...">` の中身を以下に差し替える:

```
DAZN、J SPORTS、WOWOW で見たい試合が重なる週末でも、Six
Nations・Premiership・URC をはじめとする主要大会の試合の流れと見どころを
日本語レビューと試合チャットで追えます。
```

### 2) `app/page.tsx` — 「今後の試合」重複除外（`upcomingMatches` 処理後）

`homepageWeekMatches` を計算した直後（L130–132 付近）に追加:

```typescript
const homepageUpcomingMatches = upcomingMatches.filter(
  (match) => !homepageWeekMatches.some((wm) => wm.id === match.id),
);
```

JSX 側（L384 付近）の `upcomingMatches.length > 0` と `upcomingMatches.map(...)` を `homepageUpcomingMatches` に置き換える。

### 3) `lib/db/queries/matches.ts` — `RECENTLY_REVIEWED_MATCH_SELECT`（L303–330 付近）

competition の select に `name_ja,` を1行追加:

```
competition:competitions!matches_competition_id_fkey (
  slug,
  name,
  name_ja,
  season
)
```

`RecentlyReviewedContentRow` の competition 型（または内部 `RecentlyReviewedMatchRow` の competition）に `name_ja?: string | null` を追加する。

### 4) `app/page.tsx` — `formatCompetitionTitle` の呼び出し変更（2箇所）

**「最近のレビュー」セクション**（L459 付近）:
```typescript
// Before
{formatCompetitionTitle(match.competition.name, match.competition.season)}

// After
{formatCompetitionTitle(match.competition, match.competition.season)}
```

**Hero section のサンプルカード**（L237 付近）:
```typescript
// Before
{formatCompetitionTitle(sampleMatch.competition.name, sampleMatch.competition.season)}

// After
{formatCompetitionTitle(sampleMatch.competition, sampleMatch.competition.season)}
```

`formatCompetitionTitle` は `CompetitionDisplayInput` 型を既にサポートしており、`nameJa` があれば日本語名を使う実装済みのため、呼び出し側を変えるだけでよい。

## 完了の定義

- `pnpm tsc --noEmit` が通る
- `pnpm test` が通る
- 変更ファイル: `app/page.tsx` と `lib/db/queries/matches.ts` の2ファイルのみ
