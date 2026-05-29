# SNS 投稿に試合結果ビジュアル画像を添付

## 背景

現状の X 投稿はテキストのみ（スコア・チーム名・ハッシュタグ）。
ラグビーの X タイムラインは画像付き投稿が前提で、テキストのみは停止率が著しく低い。
インプレッション 7〜10 の主因の一つ。

OG 画像エンドポイント（`/api/og`）はすでに `type=result` モードを持っており、
ホーム・アウェイ・スコア・大会名からリザルトカードを生成できる。
Twitter v2 API でメディアアップロードして tweet に添付することで実現できる。

## スコープ

対象:
- `lib/x/media.ts`（新規）— OG 画像の fetch と Twitter メディアアップロード
- `lib/x/post.ts` — `postMatchRecapToX` で画像取得・添付

対象外:
- プレビュー投稿への画像添付（リザルトカードがないため。将来課題）
- Discord 通知への画像添付
- TikTok / Instagram への展開

## データモデル変更

なし

## API サーフェス

### `lib/x/media.ts`（新規）

```typescript
// SITE_URL/api/og?type=result&home=...&away=...&hs=...&as=...&comp=... を fetch して Buffer 化する
export async function fetchOgImageBuffer(params: {
  away: string;
  awayScore: number;
  competition: string;
  home: string;
  homeScore: number;
}): Promise<Buffer>

// client.v1.uploadMedia を呼んで media_id_string を返す
export async function uploadMediaToX(
  client: TwitterApi,
  imageBuffer: Buffer,
  mimeType: "image/png",
): Promise<string>
```

OG 画像 URL のパラメータ（既存 `/api/og` エンドポイントに合わせる）:

| クエリパラメータ | 内容 |
|---|---|
| `type` | `result` |
| `home` | ホームチーム名 |
| `away` | アウェイチーム名 |
| `hs` | ホームスコア |
| `as` | アウェイスコア |
| `comp` | 大会名 |

### `lib/x/post.ts` — `postMatchRecapToX` の変更

recap かつスコアが存在する場合のみ画像を取得・添付する。
失敗時はサイレントフォールバックでテキストのみ投稿を続行する。

```typescript
export async function postMatchRecapToX(params: XPostParams): Promise<string> {
  const client = new TwitterApi(getXCredentials(params.language));
  let mediaId: string | undefined;

  if (
    params.contentType === "recap" &&
    params.homeScore !== null &&
    params.awayScore !== null
  ) {
    try {
      const buf = await fetchOgImageBuffer({
        away: params.awayTeamName,
        awayScore: params.awayScore,
        competition: params.competitionLabel,
        home: params.homeTeamName,
        homeScore: params.homeScore,
      });
      mediaId = await uploadMediaToX(client, buf, "image/png");
    } catch {
      // 画像取得/アップロード失敗 → テキストのみで続行
    }
  }

  const result = await postTweetWithReply({
    language: params.language,
    mediaId,
    replyText: buildReplyText(params.matchId, params.language),
    tweetText: buildTweetText(params),
  });

  return result.tweetId;
}
```

`postTweetWithReply` に `mediaId?: string` を追加し、ツイート時に渡す:

```typescript
const mediaOptions = mediaId
  ? { media: { media_ids: [mediaId] as [string] } }
  : {};

const { data: mainTweet } = await client.v2.tweet(params.tweetText, mediaOptions);
```

## 受け入れ条件

1. recap 投稿かつスコアありの場合、X にリザルトカード画像付きツイートが投稿される。
2. OG 画像の fetch または upload に失敗した場合、throw せずテキストのみで投稿が続行される。
3. preview 投稿・スコアなしの場合、画像添付は行われない。
4. `lib/x/media.ts` のユニットテストを追加:
   - `fetchOgImageBuffer` が正しいクエリパラメータで URL を組み立てることをテスト。
   - `uploadMediaToX` が `client.v1.uploadMedia` を呼ぶことをテスト（モック）。
5. `tsc --noEmit` でビルドエラーなし。

## 未解決の質問

- `SITE_URL` が本番 URL に設定されていることが前提。ステージング環境でのテスト時は OG エンドポイントが 404 になる可能性がある。Codex がフォールバック処理で吸収するか、環境変数で切り替えるか判断する。
- `twitter-api-v2` ライブラリで `client.v1.uploadMedia` が利用可能であることを実装前に確認すること。