`specs/fix-ops-notifications-discord.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- 背景: `lib/llm/notify.ts` の運用アラート4種が `postToSlack`（12〜41行）経由で `SLACK_WEBHOOK_URL` に送られているが、この環境変数は本番に設定されていない。本番ランタイムログで `[content-pipeline] slack webhook is not configured` を確認済み。処理は 200 で成功し cron も success になるため、通知だけが静かに落ち続けていた
- 変更対象は次の2ファイルのみ:
  - `lib/env.ts`（`DISCORD_WEBHOOK_OPS` の追加）
  - `lib/llm/notify.ts`（送信関数の置き換え）
- 参考にする既存パターン:
  - 既存の Discord webhook 変数の定義: `lib/env.ts:10-12`（`DISCORD_WEBHOOK_EN` / `DISCORD_WEBHOOK_JA` / `DISCORD_WEBHOOK_WEEKLY_DIGEST`）。同じ `z.string().url().optional()` に揃える
  - Discord への送信と文字数制限の扱い: `app/api/cron/notify-discord/route.ts`（`truncateDiscordCodeBlockValue` と `DISCORD_FIELD_VALUE_LIMIT` の使い方）。ただし運用アラートは embed ではなくプレーンな `{ content: text }` で送る

実装のポイント:
- `postToSlack` を Discord 送信に置き換え、関数名を実態に合わせる（例: `postOpsAlert`）。呼び出し側4箇所（63・79・105・144行）は関数名の変更のみ
- ペイロードは `{ content: text }`
- **2000文字上限の切り詰めを必ず入れる**。Discord は本文2000文字を超えると 400 を返し通知が失われる。切り詰めたことが受信側で分かるように末尾に印を付ける
- 未設定時はスキップして return する挙動を維持するが、**`console.warn` ではなく `console.error`** にし、メッセージに `DISCORD_WEBHOOK_OPS` という変数名を含める。今回のバグが長期間気づかれなかったのは warn で握り潰していたためなので、ここは意図的に変える
- 送信失敗（非 2xx）時も例外は投げず `console.error` に留める。cron を落とさない

エッジケース:
- ちょうど2000文字のメッセージが切り詰められずに送られること（境界のオフバイワンに注意）
- 切り詰めの印を付けた結果として全体が2000文字を超えないこと
- `DISCORD_WEBHOOK_OPS` が未設定でも4関数のいずれもが例外を投げないこと
- `fetch` 自体が throw した場合（ネットワーク断）も例外を外に出さないこと

やらないこと:
- 4関数（`notifyContentRejected` / `notifyCostAlert` / `notifyDataIntegrityReport` / `notifyBroadcastIngestReport`）の**シグネチャとメッセージ本文の変更**。文面は現状のまま維持する。既存テストの文言アサーションが通ることで担保する
- `DISCORD_WEBHOOK_EN` / `DISCORD_WEBHOOK_JA` / `DISCORD_WEBHOOK_WEEKLY_DIGEST` の流用・用途変更。これらはユーザー向けコンテンツ通知の経路なので、運用アラートを混ぜない
- `app/api/cron/notify-discord/route.ts` / `app/api/cron/weekly-digest/route.ts` の変更
- 各 cron ルート側の変更
- `lib/llm/notify.ts` のモジュール移動・リネーム（LLM と無関係な通知が同居しているが今回は動かさない）
- 通知の再送・キュー・リトライの実装

`SLACK_WEBHOOK_URL` の扱い:
- `lib/llm/notify.ts` 以外から参照されていないことを確認したうえで、参照が無ければ `lib/env.ts` の定義も削除してよい
- 他に参照が残っている場合は定義を残す。**どちらにしたかを完了報告に明記すること**

テスト:
- 未設定時にスキップし `console.error` に変数名が出ること
- 2000文字超が切り詰められ、印が付き、かつ全体が2000文字以内に収まること
- 非 2xx レスポンスで例外を投げず `console.error` が出ること
- 4関数それぞれが新しい送信経路を通ること
- 既存の文言アサーションが変更なしで通ること

完了の定義:
- spec の受け入れ条件1〜9をすべて満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- `SLACK_WEBHOOK_URL` の定義を削除したか残したか、その理由を報告する
- 切り詰めの実装方針（何文字で切り、どんな印を付けたか）を報告する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
