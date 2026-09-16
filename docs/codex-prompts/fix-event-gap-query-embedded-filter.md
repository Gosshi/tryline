# Codex 指示書: イベント未取得の試合を選ぶクエリの修正

仕様: `specs/fix-event-gap-query-embedded-filter.md`（権威。ここに書いていない判断は仕様書に従う）

## 問題

`match_events!left(id)` を select して `.is("match_events.id", null)` で絞る書き方は、**PostgREST では親行を絞り込まない**（埋め込み配列が空になるだけ）。そのため「イベントを持たない試合」を取れておらず、実際には「`finished` を `kickoff_at` 降順で N 件」を返している。

本番で確定済み: Top 14 の取り込みは3回連続で同じ `{"eventsInserted":132,"targetMatches":7}` を返し、毎回**既に取り込み済みの j2（9/12-13）を書き直していた**。j1（9/5-6）の7試合はイベント0件のまま到達不能で、レビューを作れない。

## 直すファイル

| ファイル | 行 |
|---|---|
| `scripts/backfill-top14-lnr-match-events.ts` | 98・104（`loadTargetMatches`） |
| `scripts/fill-event-gaps.ts` | 360・364（`loadGapMatches`） |
| `app/api/cron/fill-event-gaps/route.ts` | 124・126 |

3箇所とも**2段階**にする。関数名・引数・戻り値の型は変えない。

1. `matches` から既存条件で候補を `kickoff_at` 降順に取得（**この段階で最終件数まで絞らない**）
2. `match_events` から `select("match_id").in("match_id", 候補のid配列)` で既存イベントを引く（**`in` で必ず限定する。フィルタ無しの全行取得に戻さない**）
3. 候補から除外し、**そのあとで** `MAX_TOP14_LNR_MATCHES_PER_RUN`（=7）/ `CRON_BATCH_SIZE`（=10）に切り詰める

## 特に注意すること

**既存テストが「壊れた呼び出し」をそのまま assert している。** 次の2箇所は必ず差し替えること。`.is("match_events.id", null)` が呼ばれることを期待するアサーションを残してはいけない。呼び出しの形ではなく**返ってくる試合集合**を検証する形にする。

- `tests/scripts/fill-event-gaps.test.ts:281,283`
- `tests/api/fill-event-gaps.test.ts:69,71`

**変えてはいけないもの**: レート制限（Top 14 の3秒待機、Wikipedia の1.5秒待機）、バッチ上限の値、スコア不一致時のスキップ（`event totals exceed final score` / `eventTotalsMatchFinalScore`）、`matchIds` 指定時にバッチ上限を適用しない挙動（`tests/api/fill-event-gaps.test.ts:77`）。

## テストの置き場所

`vitest.config.ts` は `tests/db/**` を既定実行から除外している。そこに置くと `pnpm test` で走らない。既存に合わせ `tests/scripts/` と `tests/api/` を使うこと。`loadTargetMatches` には現在テストが無い（`tests/api/ingest-top14-match-events.test.ts` は `runTop14LnrMatchEventBackfill` ごとモックしているため、このバグを検出できなかった）。新規に追加すること。

## 完了の定義

仕様書の受け入れ条件1〜10。特に次の2つを省略しない。

1. **意図的破壊の確認（AC8）**: 除外処理を外す、または除外前に `limit` を適用すると、AC1・2・5 のテストが**実際に落ちる**ことを確かめ、結果を PR 本文に書く。
2. **件数の根拠（AC5）**: 「候補7件のうち5件が既にイベントを持つ」フィクスチャで、上限7のときに**残り2件**が返ることを検証する。除外前に切り詰める実装だとここが落ちる。

本番での検算（AC9）は Owner 承認が要るため、Codex 側では実行しないこと。PR 本文に「未実施」と明記する。

## 検証コマンド

```
pnpm typecheck
pnpm lint
pnpm test
```

`pnpm test` のテスト総数が 311 files / 1,901 tests から減っていないことを PR 本文に書くこと。

## 依存

追加パッケージなし。マイグレーションなし。本番DBへの書き込みなし。
