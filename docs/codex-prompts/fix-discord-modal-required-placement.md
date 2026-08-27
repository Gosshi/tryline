PR #738 でマージした Discord モーダルが**本番で開きません。** 追加の修正をお願いします。

## 症状

Discord でコンテキストメニュー「事実を追加」を実行すると、クライアントに次が表示されます。

```
アプリケーションは時間内に応答しませんでした
```

**しかしサーバー側は正常です。** Vercel の本番ログでは `POST /api/discord/interactions` が **200** を返しており、例外は出ていません（12:29:34 と 12:29:54 の2回、いずれも 200）。

これは **Discord がこちらの返した interaction response を不正と判断して破棄した**ときの症状です。応答が登録されないため、クライアント側だけがタイムアウト表示になります。

## 原因: `required` の位置が間違っています

**前回の指示書 `docs/codex-prompts/fix-discord-fact-entry-modal-components.md` に誤りがありました。** そこに「`label` と `required` は Text Input / Select 自身ではなく Label 側に置きます」と書きましたが、**`required` は Label のフィールドではありません。**

Discord のコンポーネントリファレンス（https://docs.discord.com/developers/components/reference）では:

- **Label（type 18）のフィールドは `type` / `id?` / `label` / `description?` / `component` のみ。** `required` は無い
- **Text Input（type 4）に `required?: boolean`（既定 true）がある**
- **String Select の `required` も Select 自身に付く**

つまり `label` を Label に移すのは正しく、**`required` を移したのが誤り**でした。現在の payload は Label に未知フィールドが付き、かつ Text Input から `required` が失われています。

## 修正内容

`app/api/discord/interactions/route.ts` の `buildFactEntryModal` を次の形にしてください。

```jsonc
{
  "type": 9,
  "data": {
    "custom_id": "fact-entry:<match_id>:<news_link_id>",
    "title": "事実を追加",
    "components": [
      {
        "type": 18,
        "label": "事実",
        "component": {
          "type": 4,
          "custom_id": "fact",
          "style": 2,
          "required": true
        }
      },
      {
        "type": 18,
        "label": "確度",
        "description": "未選択なら medium",
        "component": {
          "type": 3,
          "custom_id": "confidence",
          "required": false,
          "placeholder": "確度を選択",
          "options": [
            { "label": "high", "value": "high" },
            { "label": "medium", "value": "medium", "default": true },
            { "label": "low", "value": "low" }
          ]
        }
      }
    ]
  }
}
```

変更点は3つです。

1. **`required` を Label から wrapped component へ移す**（`fact` は `true`、`confidence` は `false`）
2. **Label から `required` を削除する**
3. **Select から `min_values` / `max_values` を削除する。** 任意であることは `required: false` が表す。`min_values: 0` と `required` の既定値 true が矛盾する可能性を消しておく

`label` が Label 側にあること、`component`（単数形）でネストすることは**現状のままで正しい**ので変えないでください。

## テストの更新

`tests/api/discord-interactions.test.ts` のモーダル構造の assert が `required` を Label 側で見ています。**wrapped component 側を見るように直してください。**

- `components[0]` は `{ type: 18, label: "事実" }` を満たす（`required` は見ない）
- `components[0].component` は `{ type: 4, custom_id: "fact", style: 2, required: true }` を満たす
- `components[1]` は `{ type: 18, label: "確度" }` を満たす
- `components[1].component` は `{ type: 3, custom_id: "confidence", required: false }` を満たす

**`components[0]` と `components[1]` に `required` キーが存在しないこと**を明示的に assert してください。同じ誤りの再発をここで止めます。

## やらないでください

- `findComponentValue` の変更（単数形・複数形の両対応は正しく、submit の形は今回の症状と無関係）
- 署名検証・Owner 照合・`news_links` 照合の変更
- `lib/llm/sourced-facts/fetch.ts` / `allowlist.ts` / `lib/news-links.ts` の変更
- Label 形式そのものをやめて Action Row に戻すこと（**Action Row + Text Input は deprecated**。原因は形式ではなくフィールドの位置）
- spec の受け入れ条件の削除・変更

## 完了の定義

- Label に `required` が無い
- Text Input に `required: true`、String Select に `required: false` がある
- Select に `min_values` / `max_values` が無い
- Label に `required` が無いことのテストがある
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` が clean

## 補足

**このブランチはマージ済みなので、新しいブランチと PR を作ってください。** 修正が小さいので単独 PR で構いません。

デプロイ後、Discord 側の再設定は不要です。Endpoint URL もコマンド登録もそのまま使えます。Owner がもう一度コンテキストメニューを実行するだけで検証できます。
