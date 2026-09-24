# orchestrate が 1 回 1〜2 本しか作れず、2 本目で毎回 504 になる

## 背景

`specs/fix-orchestrate-time-budget.md`（PR 実装済み、`70f344e`）で、新しい生成を「開始する前」に経過時間を確かめ、210 秒を過ぎたら開始しないようにした。同 spec の未解決の質問 3 で、**この値はデプロイ後の実測を見て調整する前提**で、判定基準は「`Orchestrate` ステップが 300 秒未満で成功すること」（受け入れ条件 10）と決めていた。

### 実測（2026-09-22〜23）: 基準を満たしていない

`Cron — Live Pipeline` の直近 6 回（`gh run list --workflow cron-live-pipeline.yml`）:

| 開始（UTC） | 結果 |
|---|---|
| 09-23 11:02 | **失敗**（orchestrate が `curl: (22) ... 504`） |
| 09-23 03:56 | 成功 |
| 09-22 21:01 | **失敗** |
| 09-22 16:33 | **失敗** |
| 09-22 12:45 | **失敗** |
| 09-22 11:11 | 成功 |

各回で保存された recap（`match_content.generated_at`）と、その試合の事実取得時刻（`match_sourced_facts.fetched_at`）:

| 実行 | 事実取得 → recap 保存 | 所要 |
|---|---|---:|
| 09-22 12:4x | 12:48:06 → 12:50:57 | 171 秒 |
| 09-22 16:33 | 16:36:08 → 16:39:27 | 199 秒 |
| 09-23 11:02 | 11:04:49 → 11:07:21 | 152 秒 |

**1 本の生成（抽出・本文・QA）に 150〜200 秒かかる。** 前 spec の実測（69〜220 秒）とも合う。

そのため毎回次のようになる:

1. 1 本目を 0 秒目に開始 → 150〜200 秒で保存
2. 2 本目を 150〜200 秒目に開始（予算 210 秒の内側なので開始できてしまう）
3. 2 本目の途中で 300 秒に達し、504

**「予算の直前に開始した運の悪い 1 本」ではなく、2 本目は構造的にほぼ必ず間に合わない。** 504 のため、同 spec が守ろうとした「時間切れでも通知が飛ぶ」も失われている。

### 処理量も足りない

- 1 回 1〜2 本 × 1 日 4 回で、**1 日 4〜8 本**
- 2026-09-24 時点の recap 未処理は **URC 2025-26 の 44 本**（イベントあり。2025-12-20〜2026-05-30 の試合）。recap の候補には「いつまでの試合か」の下限が無く、**毎回の実行時間を半年前の試合の後追いに使っている**
- **URC 2026-27 は 9/25 に開幕**し、プレミアシップ・Top 14 と合わせて週末ごとに 20 本前後の試合が終わる。プレビューも同じくらい要る
- 近い重要試合: 9/27 南ア × 豪、10/10・10/17 ブレディスローカップ、10/24 日本 × フィジー、11 月の日本代表 3 戦

### 前 spec での Owner の決定（守る）

- **`maxDuration` は 300 のまま**。引き上げを前提にしない
- **1 試合 1 リクエストへの分割はやらない**（orchestrate に集約された処理が失われるため）

本 spec はこの 2 つを変えない。

## スコープ

対象:
- 「開始してよいか」の判定を、**1 本分の所要を見込んだ締め切り**に変える
- **recap も preview と同じく同時 3 本**で流す（1 回の呼び出しで 3 本作る）
- orchestrate の応答に「時間切れで開始しなかった件数」を返す
- ワークフローで、**未処理が残る間は orchestrate を最大 4 回まで続けて呼ぶ**（1 回ごとは 300 秒以内。1 試合 1 リクエストではない）
- recap の候補に下限（試合からの経過日数）を設ける（値は「未解決の質問」1）

対象外:
- `maxDuration` の変更（前 spec の決定）
- 1 試合 1 リクエストへの分割（前 spec の決定）
- 生成そのものの高速化（モデル・プロンプト・QA・再試行回数）
- preview の生成窓（D030）
- `Ingest live competitions` ステップ（約 2 分で成功している）

## データモデル変更

なし。

## API サーフェス

### 1. 開始の締め切り（`lib/cron/orchestrate.ts`）

`ORCHESTRATE_TIME_BUDGET_MS = 210_000` をやめ、次の 2 つの定数に分ける。

```ts
const ORCHESTRATE_MAX_DURATION_MS = 300_000;   // route の maxDuration と同じ値
const GENERATION_WORST_CASE_MS = 220_000;      // 1 本の最悪値（実測の最大 220 秒）
const ORCHESTRATE_FINISH_MARGIN_MS = 15_000;   // 通知・後処理の余白
```

**新しい生成を開始してよいのは、`経過時間 + GENERATION_WORST_CASE_MS + ORCHESTRATE_FINISH_MARGIN_MS <= ORCHESTRATE_MAX_DURATION_MS` のときだけ**（＝経過 65 秒まで）。

- `app/api/cron/orchestrate/route.ts` の `maxDuration` と値がずれないよう、route 側から渡すか共通の定数にする
- 実行中の 1 本を途中で止めない（前 spec と同じ）

### 2. 同時 3 本で流す

- preview と recap を**1 本の待ち行列**にして、既存の `processWithPreviewConcurrency` 相当（同時 `PREVIEW_CONCURRENCY = 3`）で流す。名前は実態に合わせて変えてよい
- **並びは preview（キックオフの早い順）→ recap（キックオフの新しい順）**。preview を先にする既存の優先順位は変えない
- recap の中身（ラインアップ取り込み → 事実取得 → 生成 → skipped の扱い → League One 英語版 → 通知）と、1 本ごとの try/catch は変えない
- `RECAP_BATCH_SIZE = 10` とイベント保有フィルタ（#844）は変えない

これで 1 回の呼び出しは「0 秒目に最大 3 本を開始 → 65 秒までに空いた枠があればさらに開始 → 最悪でも 300 秒以内に終わる」形になり、**1 回あたり 3 本前後**になる。

### 3. 応答に「残り」を返す

`OrchestrateResult` に次を足す:

```ts
remaining: { previews: number; recaps: number };  // 時間切れで開始しなかった件数
```

既存の Discord 通知の「時間切れで未処理」行（前 spec）と同じ数を使う。

### 4. ワークフローで繰り返し呼ぶ（`.github/workflows/cron-live-pipeline.yml`）

`Orchestrate` ステップを、次のループに変える。

- 最大 **4 回**呼ぶ
- 各回の応答 JSON の `remaining.previews + remaining.recaps` が 0 なら、そこで終える
- どの回かが HTTP エラー（504 など）なら、ステップを失敗にする（`curl -f` の挙動を保つ）
- `timeout-minutes: 20` → **35**（取り込み約 2.5 分＋orchestrate 最大 4 回×5 分＋余白）
- 応答 JSON の形は `apiSuccess` の包み方に合わせて読む（`jq` で `.data.remaining` など。実装時に実際の応答で確認）

1 日 4 回 × 最大 4 回 × 約 3 本 ＝ **1 日最大 48 本前後**。LLM の費用は「生成した本数」で決まるので、呼び出し回数を増やしても 1 本あたりの費用は変わらない（未解決の質問 1 の下限で、古い試合の分は減る）。

### 5. recap の候補の下限（`lib/cron/content-windows.ts` と `getMatchIdsMissingContent` の呼び出し）

recap の候補を「キックオフから `RECAP_MAX_AGE_DAYS` 日以内の試合」に限る（新規定数。**値は 14**、2026-09-24 Owner 決定）。preview には影響しない。

## UI サーフェス

なし。

## LLM 連携

- 呼び出す段階・モデル（`MODELS.FAST`／`MODELS.NARRATIVE`、`lib/llm/models.ts`）・プロンプト・QA 基準は変えない
- 同時に走る生成は最大 3 本（preview は現状どおり、recap が 1 本 → 3 本になる）
- **費用**: 1 本あたりの費用は変わらない。総額は生成本数に比例する。下限を設けると、URC 2025-26 の 44 本（未解決の質問 1）の分だけ減る

## 受け入れ条件

`tests/cron/orchestrate.test.ts` に追加する。時刻は既存どおり差し替え可能な `getCurrentTime` で動かす。

1. **締め切り**: 1 本 150 秒かかるフィクスチャで、経過 65 秒以前に空いた枠では開始し、66 秒以降は開始しない（`ORCHESTRATE_MAX_DURATION_MS - GENERATION_WORST_CASE_MS - ORCHESTRATE_FINISH_MARGIN_MS` から計算される境界で確かめる）
2. **同時 3 本**: preview 2 件・recap 5 件のとき、同時に走る生成が 3 を超えない。最初の 3 本は preview 2 件と recap 1 件（preview が先）
3. **recap も並列**: preview 0 件・recap 5 件のとき、0 秒目に recap 3 本が同時に開始する
4. **残りの返却**: 3 のフィクスチャで 1 本 150 秒のとき、`remaining.recaps` が 2（開始しなかった 2 本）
5. **下限**: `RECAP_MAX_AGE_DAYS` より古い終了試合は recap の候補に入らない。preview の候補は影響を受けない
6. **既存の保証を壊さない**: 前 spec の受け入れ条件 2・5・6（実行中の 1 本を止めない、打ち切り件数の通知、時間切れでも通知が飛ぶ）と、同 spec の 7 に列挙された既存テストが通る
7. **ワークフロー**: `remaining` が 0 のとき 1 回で終わり、残りがあるときは最大 4 回で止まることを、ループ部分をスクリプト化するなどしてテストする（YAML の中に長いシェルを直書きしない。`scripts/` か `tools/` に置いて単体テストする）
8. **壊して落ちる確認**: 条件 1 が「締め切りを 210 秒に戻した実装」で、条件 3 が「recap を逐次に戻した実装」で落ちることを一時的に壊して確認し、PR 本文に書く（コミットしない）
9. `pnpm lint`・`pnpm typecheck`・`pnpm test` が通り、CI（`gh pr checks`）が緑

### 本番での検証（Claude Code が確認）

10. デプロイ後の `Cron — Live Pipeline` で、`Orchestrate` ステップが失敗しない（各回 300 秒未満）
11. 1 回の Live Pipeline で保存される recap・preview の本数が、デプロイ前（1〜2 本）より増える
12. URC 2026-27 開幕週末（9/26〜28）の試合の recap が、試合翌日のうちにそろう

## 既存テストの巻き添え

- `tests/cron/orchestrate.test.ts` の「予算 210 秒」を前提にしたテスト（前 spec の受け入れ条件 1・3）は、新しい締め切りの値に合わせて書き直す。**意味（予算を超えたら開始しない）は保つ**
- recap の逐次処理を前提にした順序の assert があれば、「開始順」の assert に直す

## 競合とマージ順

- 触るファイル: `lib/cron/orchestrate.ts`、`lib/cron/content-windows.ts`、`app/api/cron/orchestrate/route.ts`、`.github/workflows/cron-live-pipeline.yml`、新規スクリプト、テスト
- 2026-09-24 時点で、これらを触る open PR は無い
- **URC 開幕（9/25）の週末に間に合わせたい**

## 本番操作

なし。

## 未解決の質問

1. ~~recap の候補の下限（`RECAP_MAX_AGE_DAYS`）をいくつにするか~~ → **解決（2026-09-24 Owner 決定）: 14 日**
   - 推奨: **14 日**。試合から 2 週間を過ぎたレビューは、検索でも回遊でもほとんど読まれない見込み（実測は無い）
   - 下限を入れると、URC 2025-26 の 44 本は自動では作られなくなる。必要なら後で一括の手動実行（別 spec）にする
   - 入れない場合、URC 開幕後もしばらくは新しい試合と古い 44 本が枠を取り合う（新しい試合が先に並ぶので、影響は処理量の余り次第）
2. `GENERATION_WORST_CASE_MS = 220_000` は実測の最大値。デプロイ後に 504 が出たら値を見直す（受け入れ条件 10 で判定）
