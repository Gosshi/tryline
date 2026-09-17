# Codex 指示書: orchestrate の300秒打ち切りを解消する

仕様: `specs/fix-orchestrate-time-budget.md`（権威。ここに書いていない判断は仕様書に従う）

## 問題

`Cron — Live Pipeline` の `Orchestrate` ステップが**3回連続でちょうど300秒で失敗**している（Vercel の `Task timed out after 300 seconds`）。PR #844 が recap 枠を実際に使えるようにした結果、**1回の呼び出しで最大10本の生成を試みるようになり、`maxDuration = 300` に収まらなくなった**。

**件数を減らすだけでは保証にならない。** 実測で recap 1本が **69〜220秒**。最悪ケースなら2本でも300秒を超える。**時間で止める。**

## やること

`lib/cron/orchestrate.ts` の中で完結させる。

1. **時間予算** `ORCHESTRATE_TIME_BUDGET_MS`（210_000）を新設。`runOrchestrate` の開始時刻を記録し、**新しい生成を開始する前**に経過を確認する。超えていたらそれ以降は**開始しない**（実行中の1件は中断しない）。preview と recap の両方に適用する。処理順（preview → recap）は変えない。
2. **preview の同時実行数**を `PREVIEW_CONCURRENCY`（3）に制限する。現在は `await Promise.all(previewCandidates.eligibleMatches.map(async ...))`（`lib/cron/orchestrate.ts:306`）で**上限なしの並列**。**ライブラリは追加しないこと。**
3. **打ち切り件数を通知に足す**。`RecapSkipReport` に「時間予算で開始しなかった件数」を加え、`時間切れで未処理: N件（preview M件 / recap L件）` の行を出す。**0件なら行を出さない。**

**時刻取得はテストから差し替え可能にすること**（`deps` に `now?: () => number` を足す等）。既存テストの fake timers 方式と整合させる。

## 壊してはいけないもの

- 既存の通知2行（`スキップ: N件 / バッチ枠 M件`、`候補から除外（イベント未取得）: N件`）の**意味と文言**
- `RECAP_BATCH_SIZE = 10`（据え置き。実効上限は時間予算が決める）
- `#844` のイベント保有フィルタと `RECAP_EVENT_LOOKUP_CANDIDATES = 60`
- `p3-recap-require-events.md` のガード
- 各 preview の処理内容（ラインアップ → 事実取得 → 生成 → League One 英語版）と個別 try/catch
- preview の生成窓（D030）、`maxDuration` の値、`Ingest live competitions` ステップ

## 完了の定義

仕様書の受け入れ条件1〜9。特に次を省略しない。

- **AC1・AC2**: 1件120秒・予算210秒のフィクスチャで、recap の生成呼び出しが**2件で止まり**、開始済みの2件目は**完了する**こと
- **AC4**: 同時に走っている preview 生成が**3件を超えない**こと（開始/終了を記録するフィクスチャで検証）
- **AC6**: 時間切れで打ち切ったあとも `notifyRecapSkipped` が呼ばれること（現状は関数ごと殺されて飛んでいない）
- **AC8（意図的破壊）**: 時間予算チェックを外すと AC1・AC3 が、同時実行制限を外すと AC4 が**実際に落ちる**ことを確認し、結果を PR 本文に書く

受け入れ条件10・11（本番実行での確認）は **Owner 承認が必要なので Codex 側では実行しない**。PR 本文に「未実施」と明記すること。

## テストの置き場所

`tests/cron/orchestrate.test.ts`（既存）と `tests/llm/notify.test.ts`（通知文面）。`vitest.config.ts` は `tests/db/**` を既定実行から除外しているのでそこには置かない。

## 検証コマンド

```
pnpm typecheck
pnpm lint
pnpm test
```

`pnpm test` のテスト総数が 311 files / 1,914 tests から減っていないことを PR 本文に書くこと。

## 依存

追加パッケージなし（同時実行制限も自前で実装する）。マイグレーションなし。本番DBへの書き込みなし。
