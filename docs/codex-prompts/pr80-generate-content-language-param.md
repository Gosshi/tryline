# PR #80 — generate-content API に language パラメータを追加

## 背景

`/api/cron/generate-content` は `matchIds` と `contentType` を受け取り、
`generateMatchContent(matchId, contentType)` を呼び出す。
しかし `language` パラメータを渡していないため、常に `"ja"` 固定になる。

`generateMatchContent` は第3引数として `language: ContentLanguage = "ja"` を受け付ける。
過去試合（日本語コンテンツ済み）の英語コンテンツを手動生成したい場合に使えない。

## スコープ

対象:
- `app/api/cron/generate-content/route.ts`

対象外:
- `lib/llm/pipeline.ts` — 変更不要
- `lib/cron/orchestrate.ts` — 変更不要

## 変更内容

`app/api/cron/generate-content/route.ts` の bodySchema に `language` を追加し、
`generateMatchContent` に渡す:

```ts
const bodySchema = z.object({
  matchIds: z.array(z.string().uuid()).min(1),
  contentType: z.enum(["preview", "recap"]),
  language: z.enum(["ja", "en"]).default("ja"),
});
```

```ts
const result = await generateMatchContent(
  matchId,
  parsedBody.contentType,
  parsedBody.language,
);
```

既存の呼び出し（`language` なし）はデフォルト `"ja"` になるため後方互換性あり。

## 使用方法（完了後）

以下の match_id は 5/9〜5/10 に完了したリーグワン試合（日本語 recap 生成済み、英語未生成）:

```json
{
  "matchIds": [
    "fd3ee846-8621-4439-8510-063536b5d188",
    "214ff75e-0e33-4526-87f8-6fa7bb460e08",
    "617ca4a4-1592-4593-b667-f6df1e6a7c7f",
    "bbe2949f-d930-4d6a-a775-c84678871da1",
    "f45427ef-c65c-4c0f-9d5a-8f4305ba670e",
    "73eb49f2-fa99-494b-8509-440fb2c17854"
  ],
  "contentType": "recap",
  "language": "en"
}
```

生成後は `/api/cron/post-to-x` を実行すると英語アカウントに投稿される。

## 完了の定義

- [ ] `language: "en"` を指定してリクエストすると英語コンテンツが生成される
- [ ] `language` 省略時は従来通り `"ja"` で動作する
- [ ] TypeScript エラーなし・`pnpm build` 通過
