# イベント未取得の試合を選ぶクエリが機能していない問題

## 背景

**`match_events!left(id)` + `.is("match_events.id", null)` は、イベントを持たない試合を絞り込めていない。** PostgREST では `!left` で埋め込んだリソースへのフィルタは**親行を絞り込まず**、埋め込み配列の中身が空になるだけである。結果、これらのクエリは「`status = finished` を `kickoff_at` 降順で N 件」を返すだけになる。

2026-09-16 に Top 14 で実測して確定した。

| run | 応答 | 実際に書き込まれた対象 |
|---|---|---|
| 9/15 手動 | `{"eventsInserted":132,"targetMatches":7}` | j2（9/12-13）の7試合 |
| 9/16 スケジュール（09:34 UTC） | **同じ 132/7** | j2 の同じ7試合 |
| 9/16 手動（09:39 UTC） | **同じ 132/7** | j2 の同じ7試合（`match_events.created_at` が 09:39:03〜09:39:38 に更新された） |

**j1（9/5-6）の7試合はイベント0件のまま、永久に対象にならない。** 毎日 lnr.fr へ7リクエストを投げて同じ132件を書き直している。重複投入は起きていない（upsert が冪等で、件数132と得点合計の一致は再実行後も不変であることを実測済み）。

イベントが無い試合は recap 生成でスキップされるため、**この7試合はレビューを作れない**。

### 影響範囲（2026-09-16 本番実測）

同じ書き方が3箇所にある。

| ファイル | 行 | 導入 |
|---|---|---|
| `scripts/backfill-top14-lnr-match-events.ts` | 98・104 | `5f466c7`（feat: ingest Top 14 LNR match events） |
| `scripts/fill-event-gaps.ts` | 360・364 | `00238e5`（fix: make event gap filling reliable） |
| `app/api/cron/fill-event-gaps/route.ts` | 124・126 | `00238e5` |

イベントを持たない `finished` 試合（直近400日）:

| 大会 | 件数 |
|---|---:|
| premiership 2025-26 | 18 |
| urc 2025-26 | 12 |
| **top-14 2026-27** | **7**（全件 `external_ids.top14_lnr_match_path` あり） |
| autumn-nations 2025 | 1 |
| 合計 | **38** |

### 既存 spec との関係

`specs/fix-fill-event-gaps-reliability.md` の「API サーフェス 1: ギャップ判定を DB 側へ」が、実現方法を「実装時に判断すること（`match_events` への left join と null 判定、あるいは既存の他クエリで使っている手法に合わせる）」と委ねた結果、**動作しない書き方が採用された**。本 spec はその1節と受け入れ条件6を差し替える。**同 spec の他の決定（レート制限を短縮しない、スコア不一致によるスキップを維持する、`matchIds` 狙い撃ち、報告の充実）はそのまま有効。**

## スコープ

**対象:**
- 上記3箇所の「イベントを持たない試合」の絞り込みを、実際に機能する方法へ置き換える
- 壊れた呼び出しを assert している既存テスト2箇所の差し替え
- `loadTargetMatches` / `loadGapMatches` に対する、フィルタの効きを検出できるテストの追加

**対象外:**
- レート制限（`TOP14_LNR_MATCH_DELAY_MS = 3_000`、Wikipedia 側の `sleep(1_500)`）の変更
- バッチ上限（`MAX_TOP14_LNR_MATCHES_PER_RUN = 7`、`CRON_BATCH_SIZE = 10`）の変更
- スコア不一致時のスキップ（`event totals exceed final score`）や `eventTotalsMatchFinalScore` の緩和
- 解析失敗そのもの（`no unique event block found` 等）の解消
- cron の実行頻度・スケジュール時刻
- 既存の投入済みイベントの再取得や作り直し

## データモデル変更

**なし。マイグレーション不要。読み取りクエリの組み立てのみを変更する。**

## API サーフェス

3箇所とも、**2段階の絞り込み**に置き換える。関数名・引数・戻り値の型は現状を維持する。

1. **候補の取得**: `matches` から `status = "finished"` と各箇所の既存条件（Top 14 は `competition.family = "top-14"` / `competition.season = "2026-27"` / `external_ids->>top14_lnr_match_path is not null`）で、`kickoff_at` 降順に候補を取る。**この段階では `limit` を最終件数に絞らない。**
2. **既存イベントの引き当て**: `match_events` から `select("match_id").in("match_id", 候補のid配列)` で取得する。**`in` で候補に限定すること。フィルタ無しの全行取得（旧 spec の問題3）へ戻さない。**
3. **除外と件数制限**: 候補から2で得た `match_id` を除外し、その**あと**で `MAX_TOP14_LNR_MATCHES_PER_RUN` / `CRON_BATCH_SIZE` の件数に切り詰める。

`app/api/cron/fill-event-gaps/route.ts` の `matchIds` 指定経路（`body.matchIds` があるときはバッチ上限を適用しない）は現状の挙動を維持する。指定された試合のうち**既にイベントを持つものは除外**する点も同じ。

候補段階の件数が無制限に増えないよう、**候補取得にも安全上限を設ける**こと（値は実装時に決めてよいが、38件の既存ギャップが全て候補に入る十分な大きさにすること。本番の `finished` 総数は1,000件規模である）。

## UI サーフェス

なし。

## LLM 連携

なし。スクレイパーと DB 読み書きのみで、LLM 呼び出しは発生しない。**LLM 費用の増減はゼロ。** 外部リクエスト数は減る方向（同じ7試合を毎日取り直す無駄が止まる）。

## 受け入れ条件

1. `loadTargetMatches`（Top 14）が、**イベントを既に持つ試合を返さない**。イベントあり2件・なし1件のフィクスチャで、なしの1件だけを返す。
2. `loadGapMatches`（`scripts/fill-event-gaps.ts`）が同様に、イベントを持つ試合を返さない。
3. `app/api/cron/fill-event-gaps/route.ts` の既定経路が同様に、イベントを持つ試合を処理対象にしない。
4. **`match_events` をフィルタ無しで全件取得するクエリが存在しない。** `match_events` への問い合わせが候補 id に限定されていることをテストで確認する（旧 spec の問題3への回帰防止）。
5. 件数制限が**除外のあと**に適用される。「候補7件のうち5件が既にイベントを持つ」フィクスチャで、上限7のときに残り2件が返る（除外前に切り詰めると0件や不足件数になる）。
6. `matchIds` 指定時にバッチ上限が適用されない既存挙動が維持される（`tests/api/fill-event-gaps.test.ts:77` の既存テストが通り続ける）。
7. **壊れた呼び出しを assert している既存テストを差し替える。** 対象は次の2箇所。
   - `tests/scripts/fill-event-gaps.test.ts:281,283`（`match_events!left(id)` と `is("match_events.id", null)` を assert している）
   - `tests/api/fill-event-gaps.test.ts:69,71`（同上）
   **`.is("match_events.id", null)` が呼ばれることを期待するアサーションを残さないこと。** 呼び出しの形ではなく、**返ってくる試合集合**を検証する形に変えること。
8. **意図的破壊の確認**: 除外処理を外す（または除外前に `limit` を適用する）と、受け入れ条件1・2・5のテストが**実際に落ちる**ことを確かめ、その結果を PR 本文に書く。通るが検出しないテストを防ぐため。
9. **本番での検算**（Owner 承認のうえ実行、または Owner 自身が実行）: `scripts/backfill-top14-lnr-match-events.ts --dry-run` が **対象7件**（j1 の 2026-09-05・09-06 の7試合）を出力し、j2 の7試合を含まない。2026-09-16 時点の本番実測値がこの7件である。
10. `pnpm typecheck` / `pnpm lint` / `pnpm test` が通る。テスト総数が現在の 311 files / 1,901 tests から**減っていない**。

## 未解決の質問

1. **修正後の初回実行をどう回すか。** Top 14 の日次 cron は1回7件が上限なので、j1 の7件は次の1回で埋まる。一方 `fill-event-gaps` は既存ギャップが31件（Top 14 以外）あり、`CRON_BATCH_SIZE = 10` では3回以上かかる。**週次 cron のままにするか、一時的に手動で複数回回すかは Owner 判断。**
2. **`fill-event-gaps` のギャップ31件のうち、何件が解析失敗（`no unique event block found` / `event totals exceed final score`）で元々埋まらないものかは未調査。** 修正後に検出されても、そのうち一定数は引き続きスキップされる見込み。この切り分けは本 spec の対象外とし、修正後の実測で把握する。
