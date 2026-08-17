# ライブ取り込みが別試合のイベントを書き込む問題を修正

## 背景

2026-08-17、8/15 の日本 vs オーストラリア第2戦のレビュー再生成が QA で reject された（事実根拠 1/5）。**本文が第1戦（8/8）の内容になっていた。**

調査の結果、**`match_events` そのものが第1戦のデータに置き換わっていた**ことが判明した。

### 実測

`pipeline_runs` の stage 0（スコア整合性チェック、`lib/llm/pipeline.ts:169-190`）が失敗を記録していた。

```json
{"type":"score_event_mismatch","awayDelta":18,"homeDelta":-24}
```

第2戦の DB スコアは 56-17（home=Australia）。イベントから計算すると **32-35** で、これは**第1戦のスコアそのもの**である。

現在の `match_events` 19 件はすべて `created_at = 2026-08-16 06:33:00` で、得点経過（12/13/15/16/26/27/34/35/42/43/45/49/50/53/59/70/71/78/79 分）が**第1戦と完全に一致**する。

**さらにチームが反転している。** 第1戦の 12 分は日本のトライだが、汚染後のデータでは豪州になっている。`upsertMatchEvents` に渡す `homeTeamId` / `awayTeamId` は第2戦のものを使う一方、`events` は第1戦の HTML から生成されたため、「ホーム側の得点」が別チームに付け替わった。

### 同一バッチで 5 試合が書き込まれている

```
06:32:57  Bulls vs New Zealand      18 events
06:33:00  Australia vs Japan        19 events  ← 汚染
06:33:03  Sharks vs New Zealand     15 events
06:33:07  Japan vs Australia        19 events
06:33:09  Stormers vs New Zealand   15 events
```

### 原因となっている構造

`lib/ingestion/live-ingest.ts` の 3 点。

**1. マッチキーに日付が含まれていない**（217-226 行）

```ts
function buildParsedMatchKey(match: ParsedLiveMatch | undefined) {
  const homeKey = match.homeTeamSlug ?? match.homeTeamName;
  const awayKey = match.awayTeamSlug ?? match.awayTeamName;
  return `${homeKey}:${awayKey}`;   // ← キックオフ日がない
}
```

**2. Map なので同じキーは後勝ちで上書きされる**（233-245 行）

```ts
const eventMatchByKey = new Map<string, ParsedLiveMatch>();
for (const eventMatch of eventMatches) {
  const key = buildParsedMatchKey(eventMatch);
  if (key) {
    eventMatchByKey.set(key, eventMatch);   // ← 衝突しても警告なく上書き
  }
}
```

**イベント取得元は単一の Wikipedia ページ**で、そこからシリーズ全試合をパースしている（`lib/ingestion/sources/wikipedia-lipovitan-challenge-cup-events.ts:29-45`）。**同一カードの連戦は、この構造では区別が保証されない。**

**3. 保存直前にスコア照合をしていない**（365-370 行）

```ts
const upserted = await upsertMatchEvents({
  awayTeamId: match.awayTeamId,
  events,
  homeTeamId: match.homeTeamId,
  matchId: record.id,
});
```

`dropReconciledPhantomEvents` はスコア超過分を落とす関数であり、**丸ごと別試合のイベントは検出できない**。`upsertMatchEvents` は **delete → insert**（`lib/ingestion/events.ts:67-102`）なので、**正しいデータが消えて誤ったデータに置き換わる**。

### なぜ気づけなかったか

**スコア照合が「後追い」だから。** `pipeline.ts` の stage 0 は**記事生成時**に走る。取り込み時点では何も止まらない。

今回、published（`recap@4.16.0`、8/16 02:29 生成）は汚染の 4 時間前に作られていたため無事だった。**順序が逆なら誤った記事が公開されていた。**

### 影響範囲

イベントを持つ finished 試合 1,011 件のうち、**101 件（10%）でスコアが一致しない。**

| 区分 | 件数 |
|---|---|
| 不一致 | 101 |
| 軽微（差 1〜3 点） | 44 |
| **重大（差 10 点超）** | **17** |
| **published recap を持つ** | **84** |

**既存 101 件の棚卸しと復旧は本 spec の対象外**とし、別 spec で扱う（未解決の質問 1）。本 spec は**これ以上汚染を生まないこと**に集中する。

> **2026-08-17 訂正。** 初版は「152 件・軽微 92 件・published 122 件」と記載していたが、**得点計算の定義を誤っていた**（ペナルティトライを 5 点、`penalty` type を 0 点として集計していた）。正しい定義（下記「得点の定義」）で再集計した結果が上表である。**重大な 17 件は変わらない。**

## スコープ

対象:
- `lib/ingestion/live-ingest.ts` — マッチキーの生成、Map 構築時の衝突検出、保存直前のスコア照合
- 上記に対応するテスト

対象外:
- **既存 152 件の調査・復旧**（別 spec。本 spec のマージ後に着手する）
- `lib/ingestion/events.ts` の `upsertMatchEvents`（delete → insert の方式自体は変えない）
- `lib/llm/pipeline.ts` の stage 0（記事生成時のチェックは有効なので残す）
- 各 `lib/ingestion/sources/*` のパーサー実装
- `dropReconciledPhantomEvents` のロジック変更

## 得点の定義（重要・初版で誤っていた）

**唯一の正は `lib/format/match-event-points.ts` の `pointsForMatchEvent` である。**

```ts
const PENALTY_TRY_POINTS = 7;
const TRY_POINTS = 5;

if (event.type === "try") {
  return event.is_penalty_try === true || event.isPenaltyTry === true
    ? PENALTY_TRY_POINTS   // ← ペナルティトライは 7 点
    : TRY_POINTS;
}
if (event.type === "conversion") return 2;
if (event.type === "penalty" || event.type === "penalty_goal" || event.type === "drop_goal") return 3;
return 0;
```

**注意すべき点が 3 つある。**

1. **ペナルティトライは 7 点。** ラグビーのルール上コンバージョン不要で 7 点になる。過去に 5 点として扱っていたバグを `specs/fix-penalty-try-scoring.md` で修正済み。**5 点に戻してはならない**
2. **`penalty_try` という `type` は存在しない。** `type: "try"` ＋ `metadata.is_penalty_try = true` で表現される（本番実測: 該当 57 件）
3. **`penalty` と `penalty_goal` はどちらも 3 点。** 本番の実データは `penalty_goal` のみだが、関数は両方を受ける

**新しく計算式を書き起こさず、この関数を使うこと。** 同じ計算が 2 箇所にあると、片方だけ直されて再び不整合が生まれる。

## データモデル変更

**なし。** 既存の `match_events`（`match_id` / `minute` / `type` / `team_id` / `player_id` / `metadata`）をそのまま使う。ペナルティトライの判定は `metadata.is_penalty_try` を見る。

## API サーフェス

**新規ルートなし。** 取り込み処理の内部ロジックのみ変更する。

## UI サーフェス

**変更なし。**

## LLM 連携

**なし。追加コストはゼロ。**

副次的な効果として、汚染データによる無駄な再生成（今回は QA リトライを含め 4 回の LLM 呼び出しが無駄になった）が減る。

## 受け入れ条件

### 1. マッチキーに日付を含める

1. `buildParsedMatchKey` が返すキーに**キックオフ日**が含まれる（例: `2026-08-15:australia:japan`）
2. 同一カードの連戦（同じ 2 チームで日付が異なる試合）が**別のキー**になる
3. キーの生成に使う日付は、パース結果と DB レコードの**両方で同じ粒度**であること（時刻まで含めると突合が壊れるため、**日付単位**を推奨。実装時に `ParsedLiveMatch` が持つ日付フィールドを実読して決めること）

### 2. キー衝突を検出する

4. `eventMatchByKey` の構築時に**既に同じキーが存在する場合、警告ログを出す**
5. 衝突時は**後勝ちにしない**（先に入ったものを保持する、または両方を捨てる。どちらでもよいが、**黙って上書きしない**こと）
6. 警告ログには競技スラッグと衝突したキーを含める

### 3. 保存直前のスコア照合（最重要）

7. `upsertMatchEvents` を呼ぶ**直前**に、`events` から算出した得点合計と `match.homeScore` / `match.awayScore` を照合する
8. **一致しない場合は書き込まない。** 既存のイベントを削除してはならない
9. 書き込みをスキップした場合、**競技スラッグ・match_id・期待スコア・イベント合計**を含む警告ログを出す
10. **得点の算出は `lib/format/match-event-points.ts` の `pointsForMatchEvent` を使う。** 新しく計算式を書き起こさないこと（下記「得点の定義」参照）
11. スコアが `null` の試合（未確定）では照合をスキップし、従来どおり書き込む

### 4. 回帰しないこと

12. 正常な試合（イベントとスコアが一致する）では、従来どおりイベントが書き込まれる
13. 単一試合しか含まないソースの挙動が変わらない

### テスト

14. 同一カードの連戦 2 試合を含む入力で、**それぞれ別のイベントが割り当てられる**ことのテスト
15. キー衝突時に上書きされないことのテスト
16. スコア不一致のイベント群を渡したとき、**`upsertMatchEvents` が呼ばれない**ことのテスト
17. スコア一致時は従来どおり呼ばれることのテスト
18. `pnpm test` と型チェックが通る

### 本番確認（マージ後、Owner が判断して実施）

19. **8/15 日本 vs オーストラリア戦のイベントを正しい第2戦のものに復旧する。** 本 spec のマージ前に復旧すると、次の取り込みで再び上書きされる可能性がある
20. 復旧後、recap を再生成して QA が通ることを確認する

## 未解決の質問

1. **既存 152 件の棚卸しと復旧をどうするか。** 差 10 点超の 17 件は今回と同じ「別試合のデータ」型である可能性が高く、122 件は published recap を持つ。**本 spec の対象外**とし、マージ後に別 spec で扱う。**先に本 spec を入れないと、復旧しても再汚染される**
2. **Wikipedia 上で第1戦と第2戦がどう表記されているかを実確認していない。** キーが実際に衝突したのか、それとも別の経路（パーサーが第2戦の HTML を分離できず第1戦を返した等）なのかは未確定。**受け入れ条件 3（保存前スコア照合）はどちらの原因でも防げる**ため、本 spec の有効性は変わらない。ただし原因が後者なら、キー修正だけでは不十分である
3. 軽微な不一致 92 件（差 3 点以下）は、コンバージョンやペナルティゴールの取りこぼしとみられ、今回の汚染とは別種の問題である可能性が高い。**受け入れ条件 8 により、これらの試合は今後イベントが更新されなくなる。** 現状維持（古いまま）と、不正確なデータでの上書きのどちらが良いかは判断が要る。**本 spec では「書き込まない」を採るが、警告ログで可視化して後から判断できるようにする**
