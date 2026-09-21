# Codex 指示書: Top 14 ドロップゴール対応と取り込みの試合単位分離

仕様書: `specs/fix-top14-lnr-drop-goal-and-per-match-isolation.md`
受け入れ条件は仕様書の「受け入れ条件」を正とする。以下はここで繰り返さない。

## 直したいこと

本番の Top 14 イベント取り込みが 1 試合のドロップゴールで全体停止し、
9/19〜9/20 の 6 試合が `match_events` 0 件のまま recap を作れない。

```
HTTP 500 {"detail":"Unknown Top 14 game-fact subtype: type=Point slugSubType=drop","error":"ingestion_failed"}
```

## 触るファイル

- `lib/scrapers/top14-lnr-match-events.ts`
- `scripts/backfill-top14-lnr-match-events.ts`
- `app/api/cron/ingest-top14-match-events/route.ts`
- `tests/scrapers/top14-lnr-match-events.test.ts`
- `tests/scripts/backfill-top14-lnr-match-events.test.ts`
- `tests/fixtures/top14-lnr-11835-vannes-toulouse.json`（**追加済み。再取得も再生成も不要**）

`.github/workflows/cron-ingest-top14-match-events.yml` は変更しない。
非 200 で `exit 1` する現行の挙動をそのまま使う。

## 参考にするパターン

- サブタイプ写像: `lib/scrapers/top14-lnr-match-events.ts` の `eventType()`。
  `essai` / `essai-de-penalite` / `penalite` / `jaune` / `rouge` / `orange` の既存分岐に倣う
- 増分の検証: 同ファイルのペナルティトライのガード
  （`if (isPenaltyTry && increment !== 7) throw ...`）
- フィクスチャ形式: `tests/fixtures/top14-lnr-11832-toulouse-bordeaux.json`
- フィクスチャの読ませ方: `tests/scrapers/top14-lnr-match-events.test.ts` の
  `fixtureHtml()` ヘルパ

## フィクスチャ（取得済み・再取得不要）

`tests/fixtures/top14-lnr-11835-vannes-toulouse.json` は**既にリポジトリにある**。
2026-09-21 に
`https://top14.lnr.fr/feuille-de-match/2026-2027/j3/11835-vannes-toulouse/resumes-replays`
から `:game-facts` を抽出し、値を変えずに整形しただけの実データ。
既存4フィクスチャとキー構造が完全一致することを照合済み。

**lnr.fr へ取りに行かないこと。** sui generis データベース権への配慮でリクエスト量を絞っている。

RC Vannes 23 - 29 Stade Toulousain。12 facts のうち対象はこれ 1 件。

```
21' home Point/drop score=[13, 0] Anthony BOUTHIER   （直前は [10, 0] なので home 側 +3）
```

内訳は `essai` 6 / `penalite` 3 / `jaune` 2 / `drop` 1。

**注意**: 前の版の指示書は Castres v Toulon（11836）を指定していたが誤り。
あの試合に `drop` は無い。今回の指定に従うこと。

## 入出力の具体例

以下は**形だけの例**であり、実際の minute / score / 選手名は
フィクスチャから読むこと。この指示書の値を実データとして使わない。

`eventType()`:

```
入力: { type: "Point", slugSubType: "drop", club: "away", minute: <n>, score: [h, a], player: {...} }
出力: "drop_goal"
```

`scoreEventsForIncrement()` で away 側 +3 がドロップゴールのとき:

```
入力: { fact: 上記, factType: "drop_goal", increment: 3, scoreSide: "away" }
出力: [{ type: "drop_goal", teamSide: "away", playerName: <fact の player から組み立てた名前>,
        minute: <fact.minute>, source: "top14.lnr.fr", isPenaltyTry: false }]
```

同じ fact で home 側（増分 0）:

```
入力: { fact: 上記, factType: "drop_goal", increment: 0, scoreSide: "home" }
出力: []
```

`runTop14LnrMatchEventBackfill()` の戻り値の形:

```
{ eventsInserted: <number>, targetMatches: <number>,
  failedMatches: [{ matchId: "…", label: "RC Vannes v Stade Toulousain", reason: "…" }] }
```

## 処理すべきエッジケース

1. `drop` の fact なのに自側増分が 3 でない → throw（パーサ側で弾く）
2. `isFactTeam` が false の +3 → 現行どおり `penalty_goal`。挙動を変えない
3. 1 試合の `fetchEvents` が reject → その試合だけ `failedMatches` に入れて次へ
4. 1 試合の `eventTotalsMatchFinalScore` が false → 同上。他試合の upsert は続行
5. `EventInsertionRejectedError` → 既存の `logger.warn` を残したうえで `failedMatches` へ
6. 失敗した試合でも `TOP14_LNR_MATCH_DELAY_MS` の待機は飛ばさない
7. `label` は catch から参照するので try の先頭で組み立てる
8. 全件失敗 → `eventsInserted: 0` と全件の `failedMatches` を含めて 500

## やってはいけないこと

- 既存テスト `"rejects an unknown game-fact subtype instead of ignoring it"`
  （`tests/scrapers/top14-lnr-match-events.test.ts:144`）を書き換えないこと。
  未知サブタイプはパーサ層では今後も throw する。分離するのはランナー層。
  このテストの `slugSubType` は `"drop-inconnu"` なので本変更とは衝突しない
- `failedMatches` があるのに 200 を返さないこと。緑になって事故が隠れる
- 最初の失敗でループを抜けないこと。全候補を試行し切ってから 500 を返す
- `drop_goal` を `penalty_goal` として保存して済ませないこと

## 完了の定義

- 仕様書の受け入れ条件 1〜17 をすべて満たす
- 新規テストは**修正前のコードで落ちることを先に確認**してから実装する。
  確認したことを PR 本文に書く（どのテストが修正前にどう落ちたか）
- `pnpm vitest run tests/scrapers/top14-lnr-match-events.test.ts tests/scripts/backfill-top14-lnr-match-events.test.ts`
  が全緑
- `pnpm tsc --noEmit` / `pnpm lint` が通る
- PR 本文に、フィクスチャから数えた実際のイベント件数内訳
  （try / conversion / penalty_goal / drop_goal / yellow_card）と、
  合計が 23-29 に一致することを書く
- `gh pr checks` で CI が緑になったことを確認してから完了報告する
