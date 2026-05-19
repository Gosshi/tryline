# PR #75 — X 投稿を language で投稿先アカウントに振り分け

## 前提

PR #72（`language` カラム）が完了していること。
Vercel に以下の環境変数が追加済みであること:
- `X_EN_API_KEY`
- `X_EN_API_KEY_SECRET`
- `X_EN_ACCESS_TOKEN`
- `X_EN_ACCESS_TOKEN_SECRET`

## 背景

`language = 'en'` のコンテンツを `@tryline_en` アカウントに投稿する。
`language = 'ja'` は既存の `@tryline_rugbyjp` アカウントに投稿する（変更なし）。
英語投稿にはリーグワン向けの英語ハッシュタグを使う。

## スコープ

対象:
- `app/api/cron/post-to-x/route.ts`
- `lib/x/post.ts`

対象外:
- 日本語投稿のロジック・フォーマットは変更しない

## 変更内容

### `lib/x/post.ts` — 英語用 credentials と hashtag

`XPostParams` に `language` を追加:

```ts
export type XPostParams = {
  awayScore: number | null;
  awayTeamName: string;
  competitionLabel: string;
  contentType: "recap" | "preview";
  language: "ja" | "en"; // 追加
  homeScore: number | null;
  homeTeamName: string;
  matchId: string;
  recapExcerpt: string;
};
```

credentials を `language` で切り替える:

```ts
function getXCredentials(language: "ja" | "en"): XCredentials {
  if (language === "en") {
    return {
      accessSecret: requireEnv("X_EN_ACCESS_TOKEN_SECRET"),
      accessToken: requireEnv("X_EN_ACCESS_TOKEN"),
      appKey: requireEnv("X_EN_API_KEY"),
      appSecret: requireEnv("X_EN_API_KEY_SECRET"),
    };
  }
  return {
    accessSecret: requireEnv("X_ACCESS_TOKEN_SECRET"),
    accessToken: requireEnv("X_ACCESS_TOKEN"),
    appKey: requireEnv("X_API_KEY"),
    appSecret: requireEnv("X_API_KEY_SECRET"),
  };
}
```

`postMatchRecapToX` 内で `getXCredentials(params.language)` を使う。

ハッシュタグを `language` で分岐:

```ts
const hashtagLine =
  params.language === "en"
    ? "#LeagueOne #Rugby #JapanRugby #ラグビー #リーグワン"
    : "#ラグビー #Rugby #観戦";
```

**文字数の注意**: 英語ハッシュタグ行の加重長は約 55（ASCII + CJK 混在）。
`fixedText` はすでに `getPostWeightedLength` で計算されているため追加対応不要。

### `app/api/cron/post-to-x/route.ts` — language 別クエリと投稿

日本語・英語を別クエリで取得し、同一ループで処理する:

```ts
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

const [{ data: jaData }, { data: enData }] = await Promise.all([
  db.from("match_content")
    .select(/* 既存 select */)
    .eq("status", "published")
    .in("content_type", ["recap", "preview"])
    .eq("language", "ja")
    .is("x_posted_at", null)
    .gte("generated_at", sevenDaysAgo)
    .order("generated_at", { ascending: true })
    .limit(5),
  db.from("match_content")
    .select(/* 既存 select */)
    .eq("status", "published")
    .in("content_type", ["recap", "preview"])
    .eq("language", "en")
    .is("x_posted_at", null)
    .gte("generated_at", sevenDaysAgo)
    .order("generated_at", { ascending: true })
    .limit(5),
]);

const allData = [...(jaData ?? []), ...(enData ?? [])];
```

投稿ループで `language` を渡す:

```ts
const tweetId = await postMatchRecapToX({
  // ...既存パラメータ
  contentType: content.content_type as "recap" | "preview",
  language: content.language as "ja" | "en", // 追加
});
```

## 完了の定義

- [ ] `language = 'en'` のコンテンツが `@tryline_en` から投稿される
- [ ] `language = 'ja'` のコンテンツが `@tryline_rugbyjp` から投稿される（変更なし）
- [ ] 英語ツイートに `#LeagueOne #Rugby #JapanRugby #ラグビー #リーグワン` が含まれる
- [ ] 日本語ツイートのフォーマットは変わらない
- [ ] 文字数超過エラーが発生しない
- [ ] TypeScript エラーなし・`pnpm build` 通過
