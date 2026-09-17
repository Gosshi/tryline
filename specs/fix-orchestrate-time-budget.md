# orchestrate が毎回300秒で打ち切られ、実行のたびに失敗する問題

## 背景

2026-09-16 16:25 以降、`Cron — Live Pipeline` が**3回連続で失敗**している。失敗しているのは常に `Orchestrate (preview/recap generation)` ステップで、**所要はきっかり300〜301秒**。

| run | Ingest live | Fill LO | **Orchestrate** |
|---|---:|---:|---|
| 09-16 16:25 | 145s 成功 | 2s 成功 | **300s 失敗** |
| 09-16 21:01 | 136s 成功 | 1s 成功 | **300s 失敗** |
| 09-17 04:04 | 127s 成功 | 1s 成功 | **301s 失敗** |

Vercel 側にも `Vercel Runtime Timeout Error: Task timed out after 300 seconds`（routes=/api/cron/orchestrate）が記録されている。

**原因は PR #844（`acc3c33`）の副作用。** それまで recap は「1回1本」しか作れていなかった（イベント0件の試合が10枠を占有していたため）。#844 が枠を実際に使えるようにした結果、**1回の呼び出しで最大10本の生成を試みるようになり、300秒に収まらなくなった。** 失敗の開始は #844 デプロイ後の最初の Live Pipeline 実行である。

### 実測: 1本あたり69〜220秒

同一呼び出し内で連続保存された recap の間隔（`match_content.generated_at`）:

| run | 保存時刻 | 間隔 |
|---|---|---:|
| 09-16 16:25 | 16:29:06 → 16:32:46 | **220秒** |
| 09-17 04:04 | 04:09:50 → 04:10:59 | **69秒** |

**最悪ケースの1本が220秒**であるため、「バッチを2件に減らす」では保証にならない（220×2 = 440秒 > 300秒）。**件数ではなく時間で止める必要がある。**

### 構造（コードで確認）

- `app/api/cron/orchestrate/route.ts:15` — `maxDuration = 300`
- `deps.generateContent` は `generateMatchContent`、`deps.fetchSourcedFacts` は `fetchSourcedFactsForMatch` で、**いずれも同一プロセス内の直接呼び出し**。preview・recap・事実取得・ラインアップ取り込みが**すべて1回の呼び出しの300秒を共有する**
- `lib/cron/orchestrate.ts:306` — **preview は `await Promise.all(previewCandidates.eligibleMatches.map(async ...))` で、同時実行数の上限もバッチ上限も無い**
- `lib/cron/orchestrate.ts:346` — recap は逐次 `for`、`RECAP_BATCH_SIZE = 10`

### 打ち切りで失われているもの

`notifyRecapSkipped`（除外件数の Discord 通知）は**recap ループの後ろ**にあるため、時間切れで関数が殺されると**通知が飛ばない**。#844 で追加した「候補から除外（イベント未取得）」の可視化が、実行のたびに失われている。

### 差し迫ったリスク: 2026-09-19（金）

同日に **8試合**がキックオフする（PNC 2試合＋Top 14 6試合）。プレビューの生成窓（24時間前かつ前日15:00 JST以降）に**ほぼ同時に入る**ため、上限の無い並列実行で8本の生成チェーンが同一呼び出し内で走る。**#844 とは別経路で同じタイムアウトを踏む。**

## スコープ

**対象:**
- `lib/cron/orchestrate.ts` — 時間予算による打ち切り、preview の同時実行数制限
- 打ち切った件数の可視化（既存の Discord 通知へ追加）

**対象外:**
- `maxDuration` の引き上げ（未解決の質問1）
- 1試合1リクエストへの分割（未解決の質問2）
- `p3-recap-require-events.md` のガード、`#844` のイベント保有フィルタ、候補選定そのもの
- preview の生成窓（D030）とキックオフ判定
- LLM のモデル・プロンプト・QA 基準
- `Ingest live competitions` ステップ（127〜145秒で成功しており対象外）

## データモデル変更

**なし。マイグレーション不要。**

## API サーフェス

`lib/cron/orchestrate.ts` 内で完結する。

### 1. 時間予算

新規定数 `ORCHESTRATE_TIME_BUDGET_MS`（**210_000 を想定**）を置く。`runOrchestrate` の開始時刻を記録し、**新しい生成を「開始する前」に経過時間を確認する**。予算を超えていたら、それ以降の対象を**開始せず**に打ち切る。

- 実行中の1件を途中で中断しない（220秒の1本が走り出した後に殺されないよう、210秒という値で `300 - 210 = 90秒` の余白を残す。余白の根拠は「通知と後処理を確実に終わらせること」であって、生成1本分ではない）
- **preview と recap の両方に同じ予算を適用する。** preview を先に処理する既存の順序は変えない
- 時刻の取得は `Date.now()` を直接呼ばず、**テストから差し替え可能にする**（`deps` に任意の `now?: () => number` を足すか、既存の `now` を引き回す）。既存テストが fake timers を使う方式と整合させること

### 2. preview の同時実行数

`Promise.all(...map(...))` の無制限並列をやめ、**同時実行数の上限**（新規定数 `PREVIEW_CONCURRENCY`、**3 を想定**）で流す。**ライブラリを追加しないこと**（依存追加は対象外）。

各 preview の処理内容（ラインアップ取り込み → 事実取得 → 生成 → League One 英語版）と、個別の try/catch による握り潰しは**現状のまま**変えない。

### 3. 打ち切りの報告

`RecapSkipReport` に「時間予算で開始しなかった件数」を加え、Discord 通知に1行足す。**既存の「スキップ: N件 / バッチ枠 M件」と「候補から除外（イベント未取得）: N件」の意味は変えない。**

```
時間切れで未処理: N件（preview M件 / recap L件）
```

**0件のときはこの行を出さない。**

`RECAP_BATCH_SIZE = 10` は据え置く（実効的な上限は時間予算が決める）。

## UI サーフェス

なし。

## LLM 連携

**LLM 呼び出しは減る方向。** 300秒で殺されていた分の呼び出しが無駄になっていたのに対し、予算内で確実に完了させる。モデル・プロンプト・QA 基準は変更しない。

## 受け入れ条件

1. **予算超過後は新しい生成を開始しない。** 1件あたり120秒かかるフィクスチャで予算210秒のとき、recap の生成呼び出しが**2件で止まる**（3件目を開始しない）。
2. **実行中の1件を中断しない。** 1で開始済みの2件目は最後まで完了し、結果が集計に含まれる。
3. **preview にも同じ予算が効く。** preview 候補が10件あり1件120秒のとき、予算内に収まる件数だけを開始し、残りを未処理として数える。
4. **preview の同時実行数が `PREVIEW_CONCURRENCY` を超えない。** 候補10件で、同時に走っている生成が3件を超えないことを検証する（各生成の開始/終了を記録するフィクスチャで確認する）。
5. **打ち切り件数が Discord 通知に出る。** 0件のときは当該行を出さない。既存2行（バッチ内スキップ / 候補から除外）の意味と文言は変わらない。
6. **時間切れが起きても通知が飛ぶ。** 予算で打ち切ったあとに `notifyRecapSkipped` が呼ばれることをテストで確認する（現状は関数ごと殺されて飛ばない）。
7. 既存テスト（`tests/cron/orchestrate.test.ts`）が通り続ける。特に次を壊さない。
   - `processes missing recaps from newest finished matches first`
   - `reports all events-unavailable recap skips once per batch`
   - `reports only the events-unavailable recap skips in a mixed batch`
   - `does not report recap skips when no recap is skipped`
   - `fills the recap batch with event-bearing matches and reports eventless candidates`
   - `looks past an eventless recap prefix to fill the batch`
8. **意図的破壊の確認**: 時間予算のチェックを外すと受け入れ条件1・3のテストが**実際に落ちる**ことを確かめ、結果を PR 本文に書く。同様に、同時実行制限を外すと4が落ちることも確認する。
9. `pnpm typecheck` / `pnpm lint` / `pnpm test` が通る。テスト総数が **311 files / 1,914 tests** から減っていない。

### 本番での検証（Owner 承認のうえ実施。Codex は実行しない）

10. 次回以降の `Cron — Live Pipeline` で、`Orchestrate` ステップが**300秒未満で成功**する。
11. 同じ実行で Discord 通知が届く（時間切れが発生していれば該当行が含まれる）。

## 未解決の質問

なし。以下は 2026-09-17 に Owner が決定済み。

1. **`maxDuration` は 300 のまま据え置く。** Vercel の公式ドキュメントには App Router で `1800`、Node 関数で `500` の例があり 300 は一律の上限ではないが、**枠を広げず「300秒に収まる仕事量にする」方針を採る。** 伸ばすほど1回の失敗で失うものが増えるため。**この spec も今後の追加実装も、`maxDuration` の引き上げを前提にしない。**
2. **1試合1リクエストへの分割（#837 方式）は今回やらない。** `/api/cron/generate-content` は存在するが、orchestrate にはラインアップ取り込み・事実取得・プッシュ通知・スキップ報告が集約されており、単純な置き換えでは失われる。**時間予算で収まることを実測で確認したうえで、必要になったら別 spec として扱う。**
3. **予算値 `ORCHESTRATE_TIME_BUDGET_MS = 210_000`、`PREVIEW_CONCURRENCY = 3` で開始する。** 実測は recap 1本が69〜220秒、preview は並列実行のため単体の所要が未計測。**デプロイ後の実行時間を見て調整する前提**であり、この値を固定の正解として扱わない。調整するときは受け入れ条件10（300秒未満で成功）を基準にする。
