# 運用アラートの送信先を Discord に切り替える

## 背景

`lib/llm/notify.ts` の運用アラート4種は、いずれも private 関数 `postToSlack`（同ファイル 12〜41行）を経由して送信されている。

| 関数 | 用途 |
|---|---|
| `notifyContentRejected` | コンテンツ生成の QA 却下 |
| `notifyCostAlert` | LLM コストが閾値超過 |
| `notifyDataIntegrityReport` | 週次データ整合性監査（日曜 03:30 UTC） |
| `notifyBroadcastIngestReport` | 放送情報の自動取得（日次 03:15 UTC） |

`postToSlack` は環境変数 `SLACK_WEBHOOK_URL` を読み、未設定なら `console.warn` を1行出して何もせず return する。**この環境変数は本番に設定されていない。**

2026-08-06 に放送情報取得を手動実行した際の本番ランタイムログで確定した。

```
00:34:10 POST /api/cron/ingest-broadcasts 200 [warn]
    [content-pipeline] slack webhook is not configured
```

処理自体は成功し DB へのデータ投入も行われているため、HTTP 200 と cron の success だけを見ていると異常に見えない。結果として **上記4種の通知はすべて、一度も届いていなかった可能性が高い**。とくに週次データ整合性監査は毎週レポートを生成して捨て続けていたことになる。

この問題が長期間表面化しなかった根本原因は、送信先未設定が `console.warn` の1行だけで、失敗として扱われていないことにある。

なお本プロジェクトの Discord 通知は `DISCORD_WEBHOOK_EN` / `DISCORD_WEBHOOK_JA` / `DISCORD_WEBHOOK_WEEKLY_DIGEST` を使っており（`lib/env.ts:10-12`、`app/api/cron/notify-discord/route.ts`、`app/api/cron/weekly-digest/route.ts`）、こちらは本番で稼働している。運用アラートだけが Slack 経路に取り残されていた。

## スコープ

対象:
- `lib/llm/notify.ts` の private 送信関数を Slack から Discord に置き換える
- `lib/env.ts` に運用アラート用の Discord webhook 環境変数を追加する
- 送信先未設定時のログレベルを、見落とされない形に上げる

対象外:
- 上記4関数の**シグネチャとメッセージ本文**の変更。文面はそのまま維持する
- 既存の `DISCORD_WEBHOOK_EN` / `DISCORD_WEBHOOK_JA` / `DISCORD_WEBHOOK_WEEKLY_DIGEST` の用途変更・流用。これらはユーザー向けコンテンツ通知の経路であり、内部の運用アラートを混ぜない
- `app/api/cron/notify-discord/route.ts` および `app/api/cron/weekly-digest/route.ts` の変更
- `lib/llm/notify.ts` というモジュール配置の見直し（LLM と無関係な通知が同居しているが、本 spec では動かさない）
- 通知の再送・キュー・失敗時リトライ

## データモデル変更

なし。マイグレーション不要。

## API サーフェス

### 環境変数

`lib/env.ts` のサーバー環境スキーマに追加する。

```
DISCORD_WEBHOOK_OPS: z.string().url().optional(),
```

既存の Discord webhook 変数（10〜12行）と同じ `optional()` の扱いにする。未設定でも起動時に失敗させない（cron が落ちるより通知が出ないほうが被害が小さい）。

### 送信関数

`lib/llm/notify.ts` の `postToSlack`（12〜41行）を Discord 送信に置き換える。関数名も実態に合わせて変更する（例: `postOpsAlert`）。呼び出し側4箇所（63・79・105・144行）は関数名の変更のみで、引数は変わらない。

- 送信先: `DISCORD_WEBHOOK_OPS`
- ペイロード: Discord ネイティブ形式の `{ content: text }`
- **2000文字上限**: Discord のメッセージ本文は2000文字までで、超過すると 400 が返り通知が失われる。送信前に切り詰め、切り詰めた場合はその旨が末尾で分かるようにする（例: 末尾に `…(切り詰め)` を付ける）。データ整合性監査と放送情報取得のレポートは項目が増えると2000文字を超えうる
- 未設定時: 送信をスキップして return する挙動は維持する（cron を落とさない）。ただし **`console.warn` ではなく `console.error`** で出し、メッセージに変数名 `DISCORD_WEBHOOK_OPS` を含める。Vercel のエラーログに載り、`get_runtime_errors` で拾えるようにするため
- 送信失敗時: 既存同様 `console.error` を出して例外を投げない

## UI サーフェス

なし。

## LLM 連携

なし。本 spec は通知の送信経路のみを扱う。

## 受け入れ条件

1. `lib/env.ts` に `DISCORD_WEBHOOK_OPS` が `z.string().url().optional()` で追加されている。
2. `lib/llm/notify.ts` から `SLACK_WEBHOOK_URL` への参照がなくなり、運用アラートが `DISCORD_WEBHOOK_OPS` に送られる。
3. ペイロードが Discord ネイティブ形式の `{ content: ... }` になっている。
4. 2000文字を超えるメッセージが切り詰められて送信され、切り詰めが起きたことが受信側で判別できる。切り詰めのテストがある。
5. `DISCORD_WEBHOOK_OPS` 未設定時に、送信をスキップしても例外を投げず、`console.error` に変数名を含むメッセージが出る。テストで検証されている。
6. 送信が非 2xx を返した場合に例外を投げず `console.error` が出る。テストで検証されている。
7. `notifyContentRejected` / `notifyCostAlert` / `notifyDataIntegrityReport` / `notifyBroadcastIngestReport` の4関数すべてが新しい送信経路を通る。各関数の**メッセージ本文は変更されていない**（既存テストの文言アサーションが通ること）。
8. 4関数のシグネチャが変更されていない。呼び出し側（各 cron ルート）に変更がない。
9. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean。

## 未解決の質問

1. **Owner の作業が必要。** Discord 側で運用アラート用チャンネルの webhook を作成し、Vercel の本番環境に `DISCORD_WEBHOOK_OPS` を設定したうえで再デプロイしないと通知は届かない。実装マージだけでは完結しない。

2. **既存チャンネルを流用するか。** 本 spec は運用アラート専用チャンネルを前提にしたが、既存のどれかに寄せてもよい。ユーザー向けコンテンツ通知と混ざる点をどう見るかは Owner 判断。

3. **`SLACK_WEBHOOK_URL` の定義を削除するか。** `lib/llm/notify.ts` 以外から参照されていないなら `lib/env.ts` から消してよい。他に参照がある場合は残す。実装時に確認すること。

4. **過去に落ちた通知は復元できない。** とくに週次データ整合性監査のレポートは、`app/api/cron/audit-data-integrity` を `workflow_dispatch` で手動実行すれば現時点のぶんは取得できる。本 spec のデプロイ後に一度実行して、通知が届くことの確認も兼ねるとよい。
