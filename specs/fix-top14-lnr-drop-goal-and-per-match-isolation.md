# Top 14 ドロップゴール対応と取り込みの試合単位分離

## 背景

2026-09-21 19:16 JST の `Cron — Ingest Top 14 match events` が HTTP 500 で失敗した。

```
{"detail":"Unknown Top 14 game-fact subtype: type=Point slugSubType=drop","error":"ingestion_failed"}
```

`lib/scrapers/top14-lnr-match-events.ts` の `eventType()` が lnr.fr の game-fact サブタイプ
`type="Point" / slugSubType="drop"`（ドロップゴール）を知らず throw する。

問題は 2 つある。

1. **ドロップゴールが未対応**。`eventType()` に写像が無く、`scoreEventsForIncrement()` の
   increment=3 分岐は無条件に `penalty_goal` を返すので、写像を足すだけでは種別を誤る。
2. **1 試合の失敗が実行全体を止める**。`scripts/backfill-top14-lnr-match-events.ts` の
   `runTop14LnrMatchEventBackfill()` は for ループ内に try/catch を持たず、
   最初の throw でループを抜けてルートが 500 を返す。候補は `kickoff_at` 降順なので、
   1 試合にドロップゴールがあるだけで**それ以降の試合が一度も試行されない**。

実害として、9/19〜9/20 の Top 14 6 試合が `match_events` 0 件のまま滞留している。

| キックオフ (JST) | カード | スコア | match_events |
|---|---|---|---|
| 09/19 21:30 | Castres Olympique v RC Toulon | 29-27 | 0 |
| 09/19 23:35 | Lyon OU v Section Paloise | 51-25 | 0 |
| 09/19 23:35 | Montpellier Hérault Rugby v USA Perpignan | 50-13 | 0 |
| 09/19 23:35 | Aviron Bayonnais v ASM Clermont Auvergne | 46-24 | 0 |
| 09/19 23:35 | Stade Rochelais v Racing 92 | 10-20 | 0 |
| 09/20 04:00 | RC Vannes v Stade Toulousain | 23-29 | 0 |

`lib/cron/orchestrate.ts` の recap バッチは `match_events` が 0 件の試合を候補から除外する
（`recapExcludedMatches`）ため、この 6 試合は**レビューが生成できない**。
これは #845（ペナルティトライ）と同型の「未知サブタイプで全体停止」であり、
1 の対応だけでは次の未知サブタイプで同じことが起きる。

## スコープ

対象:
- `lib/scrapers/top14-lnr-match-events.ts` のドロップゴール対応
- `scripts/backfill-top14-lnr-match-events.ts` の試合単位のエラー分離
- 上記 2 つのテスト

対象外:
- 他ソース（Wikipedia / World Rugby / JRFU）のパーサ。`drop_goal` は既に対応済み
- `match_events` のスキーマ変更。`drop_goal` は既に DB に 44 行存在する
- recap 生成ロジック本体
- Discord 通知の追加

## データモデル変更

なし。

- `ParsedPlayerMatchEvent["type"]`（`lib/scrapers/wikipedia-match-events.ts:9-15`）に
  `"drop_goal"` は既にある
- `pointsForMatchEvent()`（`lib/format/match-event-points.ts:18-23`）は
  `drop_goal` に 3 点を返す
- 本番 `match_events` には `drop_goal` が 44 行あり、型制約は通る

## API サーフェス

`runTop14LnrMatchEventBackfill()` の戻り値に失敗リストを追加する。

変更前:
```ts
return { eventsInserted, targetMatches: matches.length };
```

変更後:
```ts
return {
  eventsInserted,
  targetMatches: matches.length,
  failedMatches: Array<{ matchId: string; label: string; reason: string }>,
};
```

`app/api/cron/ingest-top14-match-events/route.ts` は、
**全候補を試行し終えたうえで** `failedMatches.length > 0` なら HTTP 500 を返す。
本文には `eventsInserted` / `targetMatches` / `failedMatches` をすべて含める。

この設計の理由: 200 を返すと GitHub Actions が緑になり、失敗が不可視になる
（`project_llm_credit_outage_silent` と同じ事故）。既存の workflow yml は
非 200 で `exit 1` し本文を `cat` するので、yml は変更しない。
成功した試合の upsert は失敗前に確定しているため、部分的な前進は保持される。

## UI サーフェス

なし。

## LLM 連携

なし。本変更はスクレイピングと永続化のみ。

## 実装方針

### 1. `eventType()` にドロップゴールを追加

`lib/scrapers/top14-lnr-match-events.ts:62-84`。既存の分岐と同じ形で追加する。

```ts
if (fact.type === "Point" && fact.slugSubType === "drop") {
  return "drop_goal";
}
```

`slugSubType` が `"drop"` であることは本番のエラーメッセージで確認済み（推測ではない）。

### 2. increment=3 の分岐で種別を分ける

`scoreEventsForIncrement()`（同ファイル L90-160）の increment=3 分岐は現在こうなっている。

```ts
if (increment === 3) {
  return [
    event(
      "penalty_goal",
      isFactTeam && factType === "penalty_goal" ? playerName(fact) : "",
    ),
  ];
}
```

ドロップゴールも +3 なので、ここを通ると `penalty_goal` として保存されてしまう。
「その fact 自身の側の +3」がドロップゴールなら `drop_goal` を出す。
`isFactTeam` が false のとき（他方の側に遅れて計上された増分）は
現行どおり `penalty_goal` を既定にする — 既存の挙動を変えないため。

選手名の入れ方は既存 2 分岐（increment 5 の try、increment 3 の penalty_goal）と揃える。
`isFactTeam` かつ `factType` が一致するときだけ名前を入れ、それ以外は空文字。

### 3. ドロップゴールの増分を検証する

ペナルティトライが自分側の増分 7 を強制している（同ファイル L112-116）のと同じ形で、
`isFactTeam` かつ `factType === "drop_goal"` なのに increment が 3 でない場合は
throw する。メッセージは既存の
`Unexpected Top 14 score increment: ${increment} for ${scoreSide} at minute ...`
を再利用する。

### 4. 試合単位のエラー分離

`scripts/backfill-top14-lnr-match-events.ts` の `for (const [index, match] of matches.entries())`
ループ本体（fetch → 突合 → upsert）を try/catch で包む。

- catch では `failedMatches` に `{ matchId, label, reason }` を push し、`continue` する
- `reason` は `error instanceof Error ? error.message : String(error)`
- `logger.warn` で 1 行出す
- catch しても `await wait(TOP14_LNR_MATCH_DELAY_MS)` のレート制限は飛ばさない
  （lnr.fr への連続アクセスを避けるため）
- 既存の `EventInsertionRejectedError` の `logger.warn` は残し、その後の `throw` を
  外側の catch が受ける形にする

`label` はループ内で既に組み立てている
`${match.home_team?.name ?? "Unknown"} v ${match.away_team?.name ?? "Unknown"}` を流用する。
現在は `eventTotalsMatchFinalScore` の後で定義されているので、
try の先頭へ移動する（catch から参照できる必要がある）。

## 受け入れ条件

### パーサ

フィクスチャ `tests/fixtures/top14-lnr-11835-vannes-toulouse.json` は
**既にリポジトリに追加済み**（2026-09-21、Claude Code が実ページから抽出）。
取得元は
`https://top14.lnr.fr/feuille-de-match/2026-2027/j3/11835-vannes-toulouse/resumes-replays`
の `<header-timeline>` の `:game-facts` を `JSON.parse` したものを、
値を変えずに indent=2 で整形しただけ。既存4フィクスチャとキー構造が完全に一致することを
機械的に照合済み（追加キー0・欠落キー0）。**再取得は不要。**

中身（12 facts）:

```
 3' home Point/penalite  score=[3, 0]   Maxime LAFAGE
 7' home Point/essai     score=[10, 0]  Eric MARKS
21' home Point/drop      score=[13, 0]  Anthony BOUTHIER   ← これが対象
25' away Point/essai     score=[13, 7]  Paul GRAOU
30' away Exclusion joueur/jaune score=[13, 7] Cyril BAILLE
31' home Point/penalite  score=[16, 7]  Maxime LAFAGE
32' away Point/essai     score=[16, 14] Santiago CHOCOBARES
39' away Point/penalite  score=[16, 17] Romain NTAMACK
48' away Point/essai     score=[16, 24] Teddy THOMAS
50' home Point/essai     score=[23, 24] Benjamin Thomas STEVENSON
58' home Exclusion joueur/jaune score=[23, 24] Benjamin Thomas STEVENSON
69' away Point/essai     score=[23, 29] Blair KINGHORN
```

slugSubType 集計: `essai` 6 / `penalite` 3 / `jaune` 2 / **`drop` 1**。
最終スコアは RC Vannes 23 - 29 Stade Toulousain で、本番 `matches` の値と一致する。

ドロップは **21分・home 側・増分 +3**（`[10,0]` → `[13,0]`）、選手は Anthony BOUTHIER。

1. `parseTop14LnrGameFactsHtml()` に上記フィクスチャを与えると throw しない。
2. パース結果に `type === "drop_goal"` のイベントがちょうど 1 件含まれ、
   その `teamSide` が `"home"`、`minute` が `21`、`playerName` が
   fact の `player` から組み立てた名前と一致する。
3. その 21 分に `penalty_goal` のイベントが 1 件も無い
   （旧実装は +3 を無条件に `penalty_goal` にするため、ここが検出点になる）。
4. パース結果を `computeParsedMatchEventPointTotals()` に通した合計が
   `{ home: 23, away: 29 }` と一致し、`eventTotalsMatchFinalScore()` が true を返す。
   イベント種別ごとの件数も assert すること。**件数は実フィクスチャから数えて書く。
   この spec では指定しない**（推測値を書かないため）。
5. 21 分の `drop` fact の `score` を `[15, 0]`（自側増分 +5）に書き換えたフィクスチャを
   与えると `/Unexpected Top 14 score increment/` で throw する。
6. 既存テスト `"rejects an unknown game-fact subtype instead of ignoring it"`
   （`tests/scrapers/top14-lnr-match-events.test.ts:144`）はそのまま通る。
   このテストが使う `slugSubType` は `"drop-inconnu"` であり `"drop"` ではないので、
   本変更で無効化されてはならない。変更が必要になった場合は設計を見直すこと。

### ランナー

7. `runTop14LnrMatchEventBackfill()` に、2 件目の `fetchEvents` だけが reject する
   `deps.fetchEvents` を渡したとき、**3 件目以降も呼ばれる**。
   （`fetchEvents` の呼び出し回数が候補数と一致することで検証する）
8. 同条件で戻り値の `failedMatches` が長さ 1 で、`matchId` が 2 件目の試合 ID、
   `reason` に投げたエラーの message が入る。
9. 同条件で `eventsInserted` に 1 件目と 3 件目の挿入数が合算されている
   （失敗した試合の分は含まれない）。
10. `eventTotalsMatchFinalScore` が false になる試合が混ざっても、
    その試合だけ `failedMatches` に入り、他の試合の upsert は実行される。
11. 全件成功したときの戻り値は `failedMatches: []` で、既存の
    `tests/scripts/backfill-top14-lnr-match-events.test.ts` の既存アサーションが
    そのまま通る（戻り値にキーが増えるだけで既存キーの意味は変えない）。

### ルート

12. `failedMatches` が空のとき、ルートは HTTP 200 を返す。
13. `failedMatches` が 1 件以上のとき、ルートは HTTP 500 を返し、
    本文に `eventsInserted` と `failedMatches` の両方を含む。
    **`targetMatches` 件すべてを試行したあとで 500 になること**
    （最初の失敗で打ち切ってはならない）。

### 検証手順

14. 上記 2/3/4/5/7/8/9/10/13 の各テストを、**修正前のコードに対して実行して落ちること**を
    確認してから修正を入れる。通ってしまうテストは検出力が無いので書き直す。
15. `pnpm vitest run tests/scrapers/top14-lnr-match-events.test.ts tests/scripts/backfill-top14-lnr-match-events.test.ts`
    が全緑。
16. `pnpm tsc --noEmit` と `pnpm lint` が通る。
17. PR を出す前に `gh pr checks` で CI の緑を確認する（main では CI が走らないため）。

## デプロイ後の運用手順

Owner または Claude Code が実施する。実装には含めない。

1. `gh workflow run cron-ingest-top14-match-events.yml` を実行
2. 上記 6 試合の `match_events` が 0 件でなくなったことを確認
3. `gh workflow run cron-live-pipeline.yml` を実行して recap を生成
4. 生成された recap の `qa_scores.factual_grounding` を確認

## 未解決の質問

1. `drop` 以外に未対応の `slugSubType` が残っている可能性がある。
   AC 7〜10 の分離が入れば全体停止はしなくなり、`failedMatches` に列挙されるので
   次の未知サブタイプは 1 回の実行で洗い出せる。追加対応はその結果を見てから決める。
2. **解決済み（2026-09-21）**: 19:16 の実行で落ちたのは Vannes v Toulouse で、
   原因は 21 分の `drop` で確定。実ページを取得して確認した。
   Castres v Toulon には `drop` は無い（`essai` / `penalite` / `jaune` のみ）。
   L'Équipe の「試合終了後のドロップゴール」は得点にならないため `game-facts` に載らない。

3. **本 spec のスコープ外だが記録**: `game-facts` の essai には `conversionPlayer` キーがあり、
   変換を決めた選手が入っている（変換なしのトライでは `null`）。
   現行実装は変換を `event("conversion", "")` と匿名で作っているので、
   **蹴った選手名を入れられる余地がある**。また `conversionPlayer === null` は
   「変換なし」の独立した裏づけになり、現行の +7/+5 の差分推定を検算できる。
   本 spec では触らない。別 spec の候補。
