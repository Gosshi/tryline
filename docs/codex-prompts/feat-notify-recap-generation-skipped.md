# Codex プロンプト: feat-notify-recap-generation-skipped

`specs/feat-notify-recap-generation-skipped.md` の受け入れ条件に従って実装してください。**仕様の内容をここで繰り返しません。先に spec を全文読んでください。**

## やること

イベント不足で recap 生成をスキップしたことを、**run 単位で1通**だけ Discord に通知します。スキップの判定ロジックそのものは変えません。

## 先に読むファイル

```
specs/feat-notify-recap-generation-skipped.md
lib/llm/pipeline.ts               ← :202-238 スコア不一致（通知あり） / :247-256 イベント不足（通知なし）
lib/cron/orchestrate.ts           ← :8 RECAP_BATCH_SIZE / :47-62 deps / :293 ループ開始 / :322-328 スキップ経路 / :340 return
lib/llm/notify.ts                 ← :45 件数上限の定数 / :80-88 切り詰め / :90 試合URL / :155 postOpsAlert / :341-359 既存通知の型
app/api/cron/orchestrate/route.ts ← deps を組み立てている場所
tests/cron/orchestrate.test.ts    ← :591 "counts skipped recap generation results without triggering push notifications"
tests/llm/pipeline-recap-skip.test.ts
```

## 一番間違えやすいところ

**試合ごとに通知しないでください。**

`:322-328` のループの中で呼びたくなりますが、**そこで呼ぶと1日10通鳴ります。** 実測で10枠すべてがスキップされる日があります。ループ内では配列に積むだけにして、**ループを抜けた後（`:340` の `return result` の前）に1回だけ**呼んでください。

**スキップ0件のときは呼ばないでください。**

ループ後に無条件で呼ぶと、**何も起きていない日も毎日鳴ります。** 受け入れ条件6がこれを守らせます。

**`skippedCount` に `batchSize` を渡さないでください。**

両方とも数値で、10枠すべてがスキップされたケースでは **どちらも 10 になり、取り違えてもテストが通ります。** 受け入れ条件7（10件中3件スキップ）がこの取り違えを検出するために存在します。`skippedCount` は `matches.length` と一致します。

**スキップ以外の戻り値に `skipReason` を付けないでください。**

`undefined` を代入するのではなく、**キーごと省いてください。** 受け入れ条件3は `"skipReason" in result === false` で確認します。**`result.skipReason === undefined` での確認にしないでください**（キーが存在しても通ってしまいます）。

**通知の失敗で run を落とさないでください。**

Discord 側が落ちても recap 生成の結果は返す必要があります。受け入れ条件9がこれを守らせます。

## テストは RED から始めてください

**RED になるのは 1・2・5・7・11・12・15 です。** いずれも「まだ存在しないもの」に依存するため落ちます。

| # | 内容 | 実装前 |
|---|---|---|
| 1 | イベント不足時に `skipReason: "events_unavailable"` | **RED** |
| 2 | スコア不一致時に `skipReason: "score_mismatch"` | **RED** |
| 5 | 10件全スキップで1回・`skippedCount: 10` / `batchSize: 10` | **RED** |
| 7 | 10件中3件スキップで `skippedCount: 3` / `matches.length === 3` | **RED** |
| 11 | 試合URLを4件までに絞り残件数を示す | **RED**（関数が無い） |
| 12 | webhook 未設定でも例外を投げない | **RED**（関数が無い） |
| 15 | route が `notifyRecapSkipped` を deps に渡す | **RED**（未配線） |
| 3 | 非スキップ時に `skipReason` キーが無い | GREEN（自明に通る） |
| 4 | LLM ステージ前に止まる既存テスト | GREEN（回帰防止） |
| 6 | スキップ0件のとき1度も呼ばれない | **GREEN（自明に通る）** |
| 8 | 未設定でも落ちず `recaps.skipped` は加算 | GREEN（既存動作の保護） |
| 9 | 通知が例外を投げても落ちない | GREEN（自明に通る） |
| 10 | `OrchestrateResult` の形が不変 | GREEN（回帰防止） |
| 13 | `console.info` の行が残る | GREEN（回帰防止） |
| 14 | スコア不一致側の通知が無改変 | GREEN（回帰防止） |

**条件6は RED ではありません。** 通知関数が存在しない段階ではモックを渡しても呼ばれようがなく、必ず通ります。**2026-09-14 の初版はこれを RED と誤記しており、Codex の指摘で訂正しました。**

## 実装後に意図的に壊して確認してください

**3・6・9 は自明に通るため、壊して初めて検出力が確認できます。** 次を一時的に適用し、**該当条件だけが落ちること**を PR 本文に示してください。

| 壊し方 | 落ちるべき条件 |
|---|---|
| 通知をループ後に**無条件で**呼ぶ（`skippedCount === 0` の分岐を外す） | **6** |
| 非スキップの戻り値に `skipReason: undefined` を**明示的に代入**する | **3** |
| 通知呼び出しの try/catch を外す | **9** |
| `skippedCount: matches.length` を `skippedCount: batchSize` に変える | **7 だけ**（5 は通る） |

最後の1つが重要です。**10枠全スキップのケースでは `skippedCount` と `batchSize` がどちらも 10 になり、取り違えても条件5は通ってしまいます。**

## 触ってはいけないもの

```
lib/llm/stages/assemble.ts          events_unavailable の判定条件
lib/llm/pipeline.ts の :202-238     スコア不一致側の通知と引数
OrchestrateResult の形              recaps.skipped の意味と加算箇所
status: "skipped" という値           orchestrate:322 が依存している
match_content / pipeline_runs のスキーマ
候補クエリ（:87-146）の絞り込み条件    除外は別 spec
```

## console の文言

`console.info("[orchestrate] recap generation skipped", …)` は**残してください**。ログからの追跡を壊さないためです。通知はこれを置き換えるものではなく、追加です。

## Discord の文面

`lib/llm/notify.ts:341-359` の `notifyEventIntegrityMismatch` と同じ作りにしてください（`postOpsAlert` を使う・`matchPageUrl` で URL を作る・日本語）。

**試合 URL は `DATA_INTEGRITY_ACTION_ITEM_LIMIT`（`:45`、値は 4）件までにし、超過分は残件数を明記してください。** 44件並べると `truncateDiscordMessageContent`（`:80-88`）で末尾が切れ、肝心の件数が読めなくなります。これは `specs/fix-data-integrity-alert-actionability.md` が定めた規約です。

## 完了の定義

1. spec の受け入れ条件16項目すべてを満たす
2. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
3. PR 本文に次を貼る
   1. 受け入れ条件 1・5・6・7 が実装前に落ちた出力（RED → GREEN）
   2. `skippedCount` を `batchSize` に差し替えたとき**条件7だけが落ちる**出力
   3. 受け入れ条件3を `"skipReason" in result` で確認した出力
   4. 10件中3件スキップのケースで `notifyRecapSkipped` が受け取った引数の実際の中身

**期待値を手で書き写さないでください。** 実際にテストを走らせた出力を貼ってください。
