# Codex 指示書: 順位表の取り込みが 1 試合の記録待ちで止まらないようにする

仕様書: `specs/fix-standings-ingest-resilience.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。**最新の `origin/main` からブランチを切る。**

## やること

1. `scripts/calculate-standings.ts`: `ensureMatchEventsAvailable` を投げない形にし、記録の無い試合があれば順位表を書き込まずに `events_pending` で `skipped` を返す。
2. `app/api/cron/ingest-standings/route.ts`: トップ14の `skipped` は 200。
3. `app/api/cron/ingest-top14-match-events/route.ts`: 得点の取り込みの後にトップ14の順位表を計算し直す。
4. `lib/llm/notify.ts`: 取り込みの失敗と、48 時間を超えた `events_pending` を Discord に通知する関数を足し、2・3 から呼ぶ。
5. `lib/ingestion/weekly-standings.ts`: 試合 0 件の大会は Wikipedia を取りに行かず `no_matches` で `skipped`。

## 守ること

- 順位表の計算の中身（勝点・ボーナス点の数え方）は変えない。
- Wikipedia の読み取り処理（`lib/scrapers/wikipedia-standings.ts`）は変えない。
- 本番の DB に書き込む操作（手動の取り込み・バックフィル）はしない。

## 処理すべきエッジケース

1. 終了した試合が 0 件（開幕前）: 今どおり計算して 0 行（または今の挙動）。`events_pending` にはしない。
2. 記録の無い試合が複数: `pendingMatchIds` にすべて入れ、通知の判定は一番古いキックオフで行う。
3. 得点の取り込みが例外で終わった: 順位表の計算は呼ばない。
4. Discord の送信が失敗: 取り込みの応答は失敗にしない（ログに残す）。

## 検証

- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて必ず実行し、結果を完了報告に含める。**
- 「壊して落ちる」確認（コミットしない）: 受け入れ条件 7。
- PR を出したらマージを待つ。
