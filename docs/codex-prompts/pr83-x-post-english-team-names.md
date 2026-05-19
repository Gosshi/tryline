# PR #83 — X 投稿の英語チーム名ハッシュタグ修正

## 背景

`app/api/cron/post-to-x/route.ts` は teams テーブルから `name`（日本語）しか取得していない。
そのため `language = 'en'` の投稿でも `#クボタスピアーズ船橋・東京ベイ` のような
日本語ハッシュタグが生成されてしまう。

PR #82 で `teams.english_name` カラムが追加されるため、
本 PR でその値を英語投稿のチーム名として利用する。

**依存**: PR #82 の `teams.english_name` マイグレーション適用後に実装すること。

## スコープ

対象:

- `app/api/cron/post-to-x/route.ts`

対象外:

- `lib/x/post.ts` — 変更不要
- `lib/llm/stages/assemble.ts` — PR #82 で対応済み

## 変更内容

### 1. `TeamRow` 型に `english_name` を追加

```ts
type TeamRow = {
  name: string | null;
  english_name: string | null;
};
```

### 2. select クエリに `english_name` を追加

```ts
home_team:teams!matches_home_team_id_fkey ( name, english_name ),
away_team:teams!matches_away_team_id_fkey ( name, english_name ),
```

### 3. `postMatchRecapToX` 呼び出し時に名前を解決

`language === 'en'` のとき `english_name ?? name` を使う:

```ts
const homeDisplayName =
  content.language === "en"
    ? (homeTeam?.english_name ?? homeTeam?.name ?? "Home")
    : (homeTeam?.name ?? "Home");

const awayDisplayName =
  content.language === "en"
    ? (awayTeam?.english_name ?? awayTeam?.name ?? "Away")
    : (awayTeam?.name ?? "Away");

const tweetId = await postMatchRecapToX({
  awayScore: match.away_score,
  awayTeamName: awayDisplayName,
  competitionLabel,
  contentType: content.content_type,
  homeScore: match.home_score,
  homeTeamName: homeDisplayName,
  language: content.language,
  matchId: content.match_id,
  recapExcerpt: createRecapExcerpt(content.content_md_ja),
});
```

## 完了の定義

- [ ] 英語投稿のハッシュタグが英語チーム名になっている
- [ ] 日本語投稿のチーム名は変わらない
- [ ] TypeScript エラーなし・`pnpm build` 通過
