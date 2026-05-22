# PR #108 — X投稿の URL をリプライに分離してリーチを改善

## 背景

現在の自動投稿はメインツイートに外部 URL を含むため、X のアルゴリズムが表示を大幅に抑制し
インプレッション 0 になっている。X はユーザーを外部に誘導する投稿の流通を意図的に絞る。

**対策**: URL をメインツイートから除去し、直後のリプライとして投稿する。
これにより本文はアルゴリズムの抑制を受けず、URL へのアクセスはリプライ経由で維持できる。

## スコープ

対象:
- `lib/x/post.ts` のみ

対象外:
- `notify-discord/route.ts` の変更なし（`buildTweetText` の呼び出しシグネチャは変わらない）
- Discord 通知部分の変更なし

---

## 変更仕様

### 1. `buildTweetText` から URL を除去

`fixedText` と最終的な `text` の組み立てから `▶️ ${matchUrl}` の行を削除する。
URL がなくなる分、excerpt に使える文字数が増える。

```ts
// Before: fixedText に URL が含まれている
const fixedText = [
  header,
  matchLine,
  "",
  "",
  "",
  `▶️ ${matchUrl}`,
  "",
  hashtagLine,
].join("\n");

// After: URL なし
const fixedText = [
  header,
  matchLine,
  "",
  "",
  hashtagLine,
].join("\n");
```

最終 `text` の組み立ても同様に URL 行を削除:

```ts
// Before
let text = [
  header,
  matchLine,
  "",
  excerpt ? `${excerpt}${excerptSuffix}` : "",
  "",
  `▶️ ${matchUrl}`,
  "",
  hashtagLine,
].join("\n");

// After
let text = [
  header,
  matchLine,
  "",
  excerpt ? `${excerpt}${excerptSuffix}` : "",
  "",
  hashtagLine,
].join("\n");
```

フォールバック（280字超過時）も URL なしに変更:

```ts
// Before
text = [header, matchLine, "", "", `▶️ ${matchUrl}`].join("\n");

// After
text = [header, matchLine, "", hashtagLine].join("\n");
```

`matchUrl` の変数定義は `buildTweetText` 内から削除する（使わなくなるため）。

### 2. `buildReplyText` 関数を追加

```ts
export function buildReplyText(matchId: string, language: "ja" | "en"): string {
  const matchUrl = `https://www.trylinerugby.com/matches/${matchId}${
    language === "en" ? "/en" : ""
  }`;
  const cta =
    language === "en" ? "Full AI analysis 👇" : "AI 戦術分析の全文はこちら 👇";
  return `${cta}\n${matchUrl}`;
}
```

### 3. `postMatchRecapToX` でリプライを投稿

```ts
export async function postMatchRecapToX(params: XPostParams): Promise<string> {
  const client = new TwitterApi(getXCredentials(params.language));
  const text = buildTweetText(params);

  const { data: mainTweet } = await client.v2.tweet(text);
  const replyText = buildReplyText(params.matchId, params.language);

  await client.v2.tweet(replyText, {
    reply: { in_reply_to_tweet_id: mainTweet.id },
  });

  return mainTweet.id;
}
```

---

## 完了の定義

- [ ] 自動投稿のメインツイートに URL が含まれない
- [ ] メインツイートの直後に URL のみのリプライが投稿される
- [ ] `notify-discord/route.ts` の `buildTweetText` 呼び出しはシグネチャ変更なしで動作する
- [ ] `buildReplyText` がエクスポートされており単体テスト可能
- [ ] TypeScript エラーなし・`pnpm build` 通過
