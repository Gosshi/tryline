仕様書 `specs/fix-event-ingestion-identity-guard.md` を実装してください。**先に全文を読んでください。**

## 何を直すか

**公開中の試合に、別試合のイベントがチーム帰属を反転した状態で入っています。**

`f01f68e2-bdd6-47c8-8910-0ea37a382b0a`（豪州 56–17 日本、2026-08-15）のイベント19件は、`2c276057-bb3a-4617-a5b1-b7742e65f034`（日本 32–35 豪州、2026-08-08）と `(minute, type, metadata.player_name)` が完全一致し、`team_id` は19件すべて逆です。合計は 32–35 で、表示スコア 56–17 と一致しません。

**原因は、ガードが1経路にしか無いことです。**

`lib/ingestion/events.ts` の `upsertMatchEvents` を呼ぶ経路は11あります。`grep -rln 'ingestion/events' --include='*.ts' app lib scripts` で確認してください。**スコア整合ガードがあるのは `scripts/fill-event-gaps.ts`（L314-327、しかも超過のみ）と `scripts/backfill-nations-championship-match-events.ts`（L155 で独自に再定義）の2つだけ**です。共通の入口である `lib/ingestion/events.ts` には何もありません。L83 で `event.teamSide === "home" ? params.homeTeamId : params.awayTeamId` と位置だけで帰属しています。

## なぜ2026-06の対策で防げなかったか

`specs/fix-contaminated-match-events.md` の「対象外」にこう書いてあります。

> `lib/ingestion/events.ts` のチーム名検証（パーサが teamSide しか返さない現構造では実装不可。Part B のスコアガードで実効的に防げる）

**この前提が外れました。** ガードは1経路にしか入らず、汚染は別経路から入りました。**今回は共通の入口に置いてください。**

## 触るファイル

```
lib/ingestion/event-integrity.ts        （新規。判定を一本化）
lib/ingestion/events.ts                 （V1〜V4 のガード）
lib/llm/stages/assemble.ts              （判定関数の移動 or 再エクスポート）
lib/data-integrity/audit.ts             （import 先の変更）
scripts/fill-event-gaps.ts              （超過限定判定を共通実装へ）
scripts/backfill-nations-championship-match-events.ts （再定義の削除）
+ upsertMatchEvents を呼ぶ残りの経路すべて
```

## やってはいけないこと

**既存の `match_events` を1行も削除・更新しないでください。** 汚染データの処理は `specs/audit-published-recap-event-integrity.md` の棚卸し結果を見て Owner が決めます。差分に DELETE / UPDATE が現れたら差し戻します。

**得点換算表を書き起こさないでください。** `lib/format/match-event-points.ts` の `pointsForMatchEvent` を使ってください。これが換算の唯一の正で、`assemble.ts:159` `live-ingest.ts:241` `player-stats.ts:76` が既に使っています。**`computeScoreTimeline` ではありません。** 2026-06 に `penalty_try` を5点として扱う誤りが実在しました（`specs/fix-penalty-try-scoring.md`）。penalty try は独立した type ではなく `type="try"` に `metadata.is_penalty_try` が立つ形です。

**V2 の設計に注意してください。** `events.ts:82-83` は `teamSide` から `homeTeamId`/`awayTeamId` を選ぶだけなので、**解決後の `team_id` がその2つに属するかを検査しても常に合格し、意味がありません。** 検査するのは入力側です（spec の V2 を読んでください）。

**共通入口を通らない独立実装が2つあります**: `scripts/import-world-rugby-full.ts:505` と `scripts/import-league-one-full.ts:335`。ガードが効かないので、対応するか対象外とするかを PR 本文に書いてください。

**パーサ（`lib/scrapers/*`）を変更しないでください。** パーサが `teamSide` しか返さない前提のまま、入口で検証します。

## 必ず入れるテスト

第2戦の状況を再現した fixture（最終スコア 56–17、投入イベント合計 32–35）で **V1 により拒否される**こと。これが本 spec の中心です。

**正常系も必ず**: 合計が一致する試合、`status` が `finished` でない試合では、従来どおり書き込みが成功すること。
