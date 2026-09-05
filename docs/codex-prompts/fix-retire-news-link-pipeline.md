仕様書 `specs/fix-retire-news-link-pipeline.md` を実装してください。**先に全文を読んでください。**

## 実装前に必ず確認すること

**`specs/feat-discord-research-fact-entry.md` のスラッシュコマンドがマージ済みで、本番で入力に成功していますか。**

**確認が取れていなければ、実装せずに Owner に確認してください。** 先に停止すると、事実を入れる経路が一時的にゼロになります。

## 何をするか

ニュースリンクの収集・Discord 通知・**コンテキストメニュー経由の事実入力**を停止し、コードを削除します。

**新設のスラッシュコマンド経由の入力は残します。** ここを壊さないことが最優先です。

## 削除するもの

```
.github/workflows/cron-collect-news-links.yml
app/api/cron/collect-news-links/          （ディレクトリごと）
lib/news-links.ts
tests/lib/news-links.test.ts
tests/api/collect-news-links.test.ts
```

`lib/news-links.ts` を import しているのは `app/api/cron/collect-news-links/route.ts` の1ファイルだけです（確認済み）。

### `app/api/discord/interactions/route.ts` から取り除くもの

- `FACT_ENTRY_COMMAND_NAME`（`"事実を追加"`）とその照合（`:116` 付近）
- `FACT_ENTRY_MODAL_PREFIX` / `MODAL_ID_PATTERN` / `MATCH_ID_PATTERN`
- `news_links` の参照（`:232` / `:234` / `:257` / `:260` 付近）
- `tests/api/discord-interactions.test.ts` の対応するケース

**残すもの**: 署名検証、PING（type 1）応答、Owner 判定、**新設スラッシュコマンドの処理一式**。

## 消してはいけないもの（2つとも実際に踏みやすい）

### 1. `DISCORD_WEBHOOK_OPS`

**`lib/llm/notify.ts:45-53` が使っています。** コンテンツ生成パイプラインの失敗通知の送信先です。

`collect-news-links` でも使われているため、**「この環境変数はニュース通知用だ」と判断して `lib/env.ts:12` の定義ごと消さないでください。** 消すと生成失敗の警告が飛ばなくなります。

**`lib/env.ts` と `lib/llm/notify.ts` には差分を作らないでください。**

### 2. `news_links` テーブル

**マイグレーションを作らないでください。** 書き込みが止まるだけで、テーブルは残します。

データの削除は取り消せません。不要と確信できた段階で別 spec で扱います。**`supabase/` 配下に差分を作らないでください。**

## テスト

- **新設のスラッシュコマンド経由の入力が従来どおり動くことを、テストで証明してください**
- 署名検証・PING 応答・Owner 判定のテストが残っていることを確認してください
- 削除した経路のテストは消してください。**残したまま skip にしないでください**

## 完了の定義

1. 仕様書の受け入れ条件15項目をすべて満たす
2. **`news_links` を参照するコードがリポジトリ内に1箇所も無い**（`lib/db/types.ts` の型定義は除く）
3. 未使用の import・定数・型が残っていない
4. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean
5. PR 本文に次を記載する
   - **削除したファイルの一覧**
   - **`app/api/discord/interactions/route.ts` で残した処理と削除した処理**
   - **`lib/env.ts` / `lib/llm/notify.ts` / `supabase/` に差分が無いことの明示**

## 判断に迷ったら

**仕様書に矛盾や不足を見つけたら、実装を進めずに質問してください。** 推測で埋めないでください。

特に「これも一緒に消したほうが綺麗では」と思ったものは、**消す前に聞いてください。** 上の2つはまさにその形で踏みやすい罠です。
