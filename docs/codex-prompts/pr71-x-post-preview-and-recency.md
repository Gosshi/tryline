# PR #71 — X 投稿をプレビューにも対応・直近 7 日フィルター追加

## 背景

現在の `/api/cron/post-to-x` は `content_type = "recap"` のみを対象としており、
`x_posted_at IS NULL` の全レコードが投稿対象になるため、過去の大量レビューが
毎日 5 件ずつ投稿され続ける問題がある。

以下の 2 点を変更する：
1. `generated_at` が直近 7 日以内のコンテンツのみ投稿（古いバックログをスキップ）
2. `content_type = "preview"` も投稿対象に追加し、ツイート形式を recap と分ける

## スコープ

対象:
- `app/api/cron/post-to-x/route.ts`
- `lib/x/post.ts`

対象外:
- 他の cron ルートは変更しない
- DB マイグレーションなし

## 変更内容

### 1. `app/api/cron/post-to-x/route.ts`

#### クエリの変更

```ts
// 変更前
.eq("status", "published")
.eq("content_type", "recap")
.is("x_posted_at", null)
.order("generated_at", { ascending: true })
.limit(5);

// 変更後
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

.eq("status", "published")
.in("content_type", ["recap", "preview"])
.is("x_posted_at", null)
.gte("generated_at", sevenDaysAgo)
.order("generated_at", { ascending: true })
.limit(5);
```

#### `postMatchRecapToX` 呼び出しに `contentType` を追加

```ts
const tweetId = await postMatchRecapToX({
  awayScore: match.away_score,
  awayTeamName: awayTeam?.name ?? "Away",
  competitionLabel,
  contentType: content.content_type as "recap" | "preview", // 追加
  homeScore: match.home_score,
  homeTeamName: homeTeam?.name ?? "Home",
  matchId: content.match_id,
  recapExcerpt: createRecapExcerpt(content.content_md_ja),
});
```

### 2. `lib/x/post.ts`

#### `XPostParams` に `contentType` を追加

```ts
export type XPostParams = {
  awayScore: number | null;
  awayTeamName: string;
  competitionLabel: string;
  contentType: "recap" | "preview"; // 追加
  homeScore: number | null;
  homeTeamName: string;
  matchId: string;
  recapExcerpt: string;
};
```

#### ツイート形式を `contentType` で分岐

```ts
export async function postMatchRecapToX(params: XPostParams): Promise<string> {
  const client = new TwitterApi(getXCredentials());

  const score =
    params.homeScore !== null && params.awayScore !== null
      ? `${params.homeScore} - ${params.awayScore}`
      : "vs";

  // recap と preview でヘッダーを分ける
  const header =
    params.contentType === "preview"
      ? `📋 ${params.competitionLabel} プレビュー`
      : `🏉 ${params.competitionLabel}`;

  const matchUrl = `https://www.trylinerugby.com/matches/${params.matchId}`;
  const hashtagLine = "#ラグビー #Rugby #観戦";
  const fixedText = [
    header,
    `${params.homeTeamName} ${score} ${params.awayTeamName}`,
    "",
    "",
    "",
    `▶️ ${matchUrl}`,
    "",
    hashtagLine,
  ].join("\n");
  const fixedLength = getPostWeightedLength(fixedText);
  const excerptSuffix = "...";
  const maxExcerptLength = Math.max(
    0,
    X_POST_WEIGHTED_LENGTH_LIMIT - fixedLength - excerptSuffix.length,
  );
  const excerpt = trimToWeightedLength(params.recapExcerpt, maxExcerptLength);

  let text = [
    header,
    `${params.homeTeamName} ${score} ${params.awayTeamName}`,
    "",
    excerpt ? `${excerpt}${excerptSuffix}` : "",
    "",
    `▶️ ${matchUrl}`,
    "",
    hashtagLine,
  ].join("\n");

  if (getPostWeightedLength(text) > X_POST_WEIGHTED_LENGTH_LIMIT) {
    text = [
      header,
      `${params.homeTeamName} ${score} ${params.awayTeamName}`,
      "",
      "",
      `▶️ ${matchUrl}`,
    ].join("\n");
  }

  const { data } = await client.v2.tweet(text);
  return data.id;
}
```

## 変更のポイント

- `generated_at >= 7日前` により既存バックログを自動スキップ。DB 変更不要
- `.in("content_type", ["recap", "preview"])` でプレビューも投稿対象に
- preview: `📋 Six Nations プレビュー / England vs France`（スコアなし → "vs"）
- recap: `🏉 Six Nations / England 24 - 18 France`（既存と同様）
- `postMatchRecapToX` の型が変わるため呼び出し側も更新が必要

## 完了の定義

- [ ] `generated_at` が 7 日より古いレコードは `x_posted_at IS NULL` でも投稿されない
- [ ] `content_type = "preview"` も投稿対象になる
- [ ] preview のツイートに「プレビュー」ラベルと 📋 絵文字が入る
- [ ] recap のツイート形式は従来と変わらない（🏉 絵文字）
- [ ] TypeScript エラーなし・`pnpm build` 通過
