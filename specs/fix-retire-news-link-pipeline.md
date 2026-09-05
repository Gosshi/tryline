# ニュースリンク収集と Discord 通知の停止

## 背景

**Discord の通知が1日13〜25件に達し、Owner が読み切れなくなっています。** 発生源は `cron-collect-news-links`（1日4回、上限20件）です。

この仕組みは 2026-08-26 に「RSS でリンクだけ集めて Owner が読み、事実を手で入れる」経路として作られました。**ChatGPT による調査経路（`specs/feat-discord-research-fact-entry.md`、D026）がその役割を置き換えたため、維持する理由がなくなりました。**

### 収集ソースがニュージーランドに限られている

| ソース |
|---|
| `rnz.co.nz/rss/sport.xml` |
| `nzherald.co.nz/arc/outboundfeeds/rss/section/sport/` |
| `stuff.co.nz/rss?section=/sport/rugby` |

**欧州の媒体が1つも入っていません。** 2026-09-25 に開幕する **URC 144試合・プレミアシップ90試合**、および進行中の **Top 14** は、このパイプラインでは1件も拾えません。

**ChatGPT 経路は全大会を日本語でカバーし、週3回で済みます**（`docs/chatgpt-prompts/README.md`）。

### 常時 LLM コストがかかっている

リンク1件ごとに `translateNewsTitle`（`lib/news-links.ts:139`、`MODELS.FAST`）で見出しを翻訳しています。**1日4回、常時発生しています。**

### 読み手が2箇所しかない

`news_links` を参照するのは次の2つだけで、**サイトには一切出ていません**（RNZ の RSS が再配信禁止のため、意図的にそうしてあります）。

| 参照元 | 用途 |
|---|---|
| `app/api/cron/collect-news-links/route.ts` | 収集と通知 |
| `app/api/discord/interactions/route.ts` | コンテキストメニュー入力の照合 |

## 実施の前提条件（重要）

**`specs/feat-discord-research-fact-entry.md` のスラッシュコマンドがマージされ、本番で1件以上の入力に成功していること。**

**この確認が取れるまで本 spec を実装してはいけません。** 先に停止すると、事実を入れる経路が一時的にゼロになります。

## スコープ

対象:
- ニュース収集 cron の停止
- 収集コードと RSS ユーティリティの削除
- **コンテキストメニュー経由の事実入力の引退**

対象外:
- **新設のスラッシュコマンド経由の入力。** これは残す
- **`news_links` テーブルの削除。** マイグレーションを作らない（後述）
- `lib/llm/notify.ts` と `DISCORD_WEBHOOK_OPS` の環境変数定義（後述）
- `app/api/cron/notify-discord`（コンテンツ公開通知）。**別件**
- 署名検証・PING 応答・Owner 判定

## 削除するもの

| 対象 | 備考 |
|---|---|
| `.github/workflows/cron-collect-news-links.yml` | ファイルごと削除 |
| `app/api/cron/collect-news-links/route.ts` | ディレクトリごと削除 |
| `lib/news-links.ts` | **import 元は上の1ファイルだけ** |
| `tests/lib/news-links.test.ts` | 削除 |
| `tests/api/collect-news-links.test.ts` | 削除 |

### `app/api/discord/interactions/route.ts` から取り除くもの

- `FACT_ENTRY_COMMAND_NAME`（`"事実を追加"`）とその照合（`:116`）
- `FACT_ENTRY_MODAL_PREFIX` / `MODAL_ID_PATTERN` / `MATCH_ID_PATTERN`
- `news_links` の参照（`:232` / `:234` / `:257` / `:260` 付近）
- 上記に対応する `tests/api/discord-interactions.test.ts` のケース

**残すもの**: 署名検証、PING（type 1）応答、Owner 判定、**新設のスラッシュコマンドの処理一式**。

## 消してはいけないもの

### `DISCORD_WEBHOOK_OPS`

**`lib/llm/notify.ts:45-53` がこの環境変数を使っています。** コンテンツ生成パイプラインの失敗通知の送信先です。

**`lib/env.ts:12` の定義を消さないでください。** 消すと生成失敗の警告が飛ばなくなります。

### `news_links` テーブル

**マイグレーションを作らないでください。** 書き込みが止まるだけで、テーブルは残します。

理由は2つです。**データの削除は取り消せない**こと、および**この判断を後から覆せる余地を残す**こと。行数も小さく、放置のコストはほぼありません。

**不要と確信できた段階で、別途 spec を立てて削除します。**

## データモデル変更

なし。

## API サーフェス

`POST /api/cron/collect-news-links` が無くなります。**呼び出し元は削除する GitHub Actions のワークフローだけ**なので、他への影響はありません。

## UI サーフェス

なし。

## LLM 連携

**`translateNewsTitle` の呼び出しが無くなります。** 1日4回発生していた見出し翻訳のコストが消えます。

## 受け入れ条件

1. `.github/workflows/cron-collect-news-links.yml` が存在しない
2. `app/api/cron/collect-news-links/` が存在しない
3. `lib/news-links.ts` が存在しない
4. `tests/lib/news-links.test.ts` と `tests/api/collect-news-links.test.ts` が存在しない
5. `news_links` を参照するコードが**リポジトリ内に1箇所も無い**（`lib/db/types.ts` の型定義を除く）
6. `app/api/discord/interactions/route.ts` から**コンテキストメニュー経由の処理が取り除かれている**
7. **新設のスラッシュコマンド経由の入力が従来どおり動作する**（テストで証明する）
8. **署名検証・PING 応答・Owner 判定に差分が無い**
9. **`lib/env.ts` の `DISCORD_WEBHOOK_OPS` の定義が残っている**
10. **`lib/llm/notify.ts` に差分が無い**
11. `app/api/cron/notify-discord/` に差分が無い
12. **マイグレーションファイルが追加されていない**
13. `supabase/` 配下に差分が無い
14. 未使用の import・定数・型が残っていない
15. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean

## Owner 側の作業（マージ後）

**Discord に登録済みのメッセージコマンド「事実を追加」を削除してください。** サーバーに残っていると、長押しメニューに出るのに動作しません。

```
DELETE https://discord.com/api/v10/applications/{application_id}/guilds/{guild_id}/commands/{command_id}
```

`command_id` は同じパスへの `GET` で確認できます。**新設のスラッシュコマンドを消さないよう、`name` を見て取り違えないでください。**

## 未解決の質問

- **NZ のテストマッチ週に自動シグナルが無くなること。** ChatGPT 経路は週3回なので、その間に出た情報は次の回まで拾われない。運用してから、必要なら別の形で補う
