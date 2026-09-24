# Codex 指示書: orchestrate が 1 回 1〜2 本しか作れず、2 本目で毎回 504 になる

仕様書: `specs/fix-orchestrate-throughput.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

**`RECAP_MAX_AGE_DAYS` の値: 14（2026-09-24 Owner 決定）**

## 直したいこと

記事生成（`lib/cron/orchestrate.ts`）は、新しい生成を「経過 210 秒まで」開始する。1 本の生成に 150〜200 秒かかるので、2 本目が 150〜200 秒目に始まり、ほぼ必ず 300 秒（`maxDuration`）を超えて 504 になる。直近 6 回中 4 回が失敗し、1 回あたり 1〜2 本しか作れていない。URC 2026-27 が 9/25 に開幕するので、週末ごとに 20 本前後の試合が来る。

## やること（仕様書の API サーフェス 1〜5）

1. 開始の締め切りを「経過 + 最悪の 1 本（220 秒）+ 余白（15 秒）≦ 300 秒」に変える（＝経過 65 秒まで）
2. preview と recap を 1 本の待ち行列にして、同時 3 本で流す（preview が先、recap はキックオフの新しい順）
3. `OrchestrateResult` に `remaining: { previews, recaps }` を足す
4. ワークフローで orchestrate を最大 4 回まで続けて呼ぶ。`remaining` が 0 なら止める。ループはスクリプト化して単体テストする
5. recap の候補を「キックオフから `RECAP_MAX_AGE_DAYS` 日以内」に限る（`getMatchIdsMissingContent` の既存の `kickoffGte` を使う）

## 触るファイル

- `lib/cron/orchestrate.ts`
- `lib/cron/content-windows.ts`（`RECAP_MAX_AGE_DAYS`）
- `app/api/cron/orchestrate/route.ts`（`maxDuration` と締め切りの値をずらさない）
- `.github/workflows/cron-live-pipeline.yml`（`Orchestrate` ステップのループ化、`timeout-minutes: 35`）
- 新規: ループ用のスクリプト（`scripts/` か `tools/`）とそのテスト
- `tests/cron/orchestrate.test.ts`

## 守ること（Owner の過去の決定）

- **`maxDuration` は 300 のまま。** 引き上げない
- **1 試合 1 リクエストへの分割はしない。** orchestrate 全体を繰り返し呼ぶだけ
- 1 本ごとの処理内容（ラインアップ取り込み → 事実取得 → 生成 → skipped の扱い → League One 英語版 → 通知）と、1 本ごとの try/catch は変えない
- `RECAP_BATCH_SIZE = 10` と、イベント保有フィルタ（#844）は変えない
- モデル・プロンプト・QA 基準は変えない

## 処理すべきエッジケース

1. preview が 3 本以上あると recap が始まらない回がありうる。preview 優先は仕様どおり。`remaining.recaps` に正しく数える
2. 1 回目の呼び出しが 504 などで失敗したら、ループを止めてステップを失敗にする（成功扱いにしない）
3. 応答は `OrchestrateResult` を JSON の直下に返す形（`route.ts` の `NextResponse.json(result)`）。`remaining` は `.remaining` から読む。**応答の形は変えない**（2026-09-24 訂正）
4. 応答に `remaining` が無ければ（route が例外時に返す 200 の 0 件応答）、ループを止めてステップを失敗にする。route の例外時の応答は変えない
5. 時間切れでも、スキップ通知（`notifyRecapSkipped`）は飛ぶ（前 spec の保証を維持）

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test`（**3 つとも必ず実行し、結果を完了報告に含める**）
- 受け入れ条件 8: 「締め切りを 210 秒に戻した実装」「recap を逐次に戻した実装」で一時的に壊して落ちることを確認し、PR 本文に書く（コミットしない）
- 本番での確認（受け入れ条件 10〜12）は Claude Code が行う

## やってはいけないこと

- `maxDuration` を変えること
- 1 試合ずつのリクエストに分けること
- 古い試合の recap を一括で作るスクリプトを足すこと（別 spec）
- ワークフローの中に長いシェルを直書きすること（スクリプトに出してテストする）

## 完了時

- PR 本文に: 変更ファイル一覧、受け入れ条件 1〜9 それぞれの確認方法と結果、「壊して落ちた」確認の内容
- ブランチは main から新しく切る。共有の作業ツリーの未コミット差分を巻き込まない。`git stash -u` は使わない
- PR 作成まで。マージはしない
