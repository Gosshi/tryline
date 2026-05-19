# PR #84 — post-to-x の投稿対象フィルターを試合開催日基準に変更

## 背景

現状の `post-to-x` は `match_content.generated_at >= 7日前` でフィルタしている。
これはコンテンツ生成日時であり、試合開催日時ではない。

そのため過去の試合のコンテンツが最近生成されると、古い試合の投稿が出てしまう。
LLM 生成コストが無駄に発生するのを防ぐため、試合開催日（`matches.kickoff_at`）を基準に変更する。

## スコープ

対象:

- `app/api/cron/post-to-x/route.ts`

対象外:

- 他ファイルの変更なし

## 変更内容

`match_content.generated_at` による 7 日フィルターを削除し、
`matches.kickoff_at >= 7 日前` に置き換える。

### 変更前

```ts
const sevenDaysAgo = new Date(
  Date.now() - 7 * 24 * 60 * 60 * 1000,
).toISOString();

// ...

.gte("generated_at", sevenDaysAgo)
```

### 変更後

`selectClause` の `matches` を `matches!inner` に変更し、`kickoff_at` を追加する:

```ts
const sevenDaysAgo = new Date(
  Date.now() - 7 * 24 * 60 * 60 * 1000,
).toISOString();
```

```ts
const selectClause = `
    id,
    match_id,
    content_type,
    language,
    content_md_ja,
    matches!inner (
      kickoff_at,
      home_score,
      away_score,
      home_team:teams!matches_home_team_id_fkey ( name, english_name ),
      away_team:teams!matches_away_team_id_fkey ( name, english_name ),
      competition:competitions!matches_competition_id_fkey ( name, season )
    )
  `;
```

`.gte("generated_at", sevenDaysAgo)` を削除し、代わりに以下を追加:

```ts
.gte("matches.kickoff_at", sevenDaysAgo)
```

### `MatchRow` 型に `kickoff_at` を追加

```ts
type MatchRow = {
  away_score: number | null;
  away_team: Relation<TeamRow>;
  competition: Relation<CompetitionRow>;
  home_score: number | null;
  home_team: Relation<TeamRow>;
  kickoff_at: string;
};
```

## 完了の定義

- [ ] 7日以上前に開催された試合のコンテンツは投稿されない
- [ ] 直近7日以内に開催された試合のコンテンツ（`x_posted_at` が null）は投稿される
- [ ] 日本語・英語ともに同じ挙動
- [ ] TypeScript エラーなし・`pnpm build` 通過
