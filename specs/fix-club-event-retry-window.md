# クラブ大会の得点イベントを、試合後 7 日まで毎回取り直す

## 背景

- 2026-09-29、Discord に「recap 生成をスキップ（イベント不足）13 件」が届いた。プレミアシップ 2026-27 の 5 試合と URC 2026-27 の 8 試合で、スコアはあるのに得点イベント（`match_events`）が 0 件だった。
- **プレミアシップの原因（Tryline 側）:** `lib/ingestion/live-ingest.ts:418-423` で、得点イベントの取り込みを試す試合を次のように絞っている。
  ```ts
  const eventMatches = result.records.filter(
    (record) =>
      record.status === "finished" &&
      !eventedMatchIds.has(record.id) &&
      (record.statusChangedToFinished ||
        source.fetchEventMatches !== undefined),
  );
  ```
  `fetchEventMatches` があるのは Nations Championship とリポビタン D チャレンジカップだけ（`lib/ingestion/live-competitions.ts:75`・`:113`）。ほかの大会は、**その回に `finished` に変わった試合だけ**を試す。Wikipedia はスコアが先に入り、得点者は数時間後に埋まることが多いので、その回に得点者が空だと二度と試さない。ログの「will retry on the next ingest」（`:436`・`:453`）は実際には起きない。
- 週 1 回の Fill Event Gaps（`cron-fill-event-gaps.yml`、日曜 06:00 UTC）が後から拾うが、最大 1 週間遅れ、レビューもその分遅れる。2026-09-29 に Fill Event Gaps を 13 試合指定で手動実行したところ、プレミアシップの 5 試合はすべて埋まった（今読めば取れる状態だった）。
- **URC の原因（取得元）:** Wikipedia「2026–27 United Rugby Championship」の得点者の欄（`try1` など）が全試合で空。この spec では直らない（取得元にデータが無い）。Wikipedia が埋まれば、この spec の再試行で取れるようになる。
- 同じ型の問題は、手動登録の代表戦で `specs/feat-manual-international-results-ingestion.md` の追記（2026-09-25）で直した（「得点イベント待ち」の取り直し）。

## スコープ

**対象**
- `ingestLiveCompetition`（`lib/ingestion/live-ingest.ts`）で、**スコアがあり得点イベントが 0 件の `finished` の試合を、キックオフから 7 日まで、毎回の取り込みで取り直す**。

**対象外**
- URC の取得元の変更。
- Fill Event Gaps（残す。7 日を過ぎた試合の受け皿）。
- 得点イベントの合計とスコアの照合（今のまま。合わなければ書かない）。
- NC・リポビタン D（`fetchEventMatches` がある大会）の今の動き。

## データモデル変更

なし。

## API サーフェス

### `lib/ingestion/live-ingest.ts`

1. 今の `eventedMatchIds` を作る処理（`finishedRecordIds` で `match_events` を引いている部分、`:398-414`）の隣で、同じ `finishedRecordIds` について `matches` から `id, kickoff_at` を引き、`kickoffAtById: Map<string, string>` を作る。
   - キックオフは DB の値を使う。`resolvedMatches` の `kickoffAt` は、`preserveExistingKickoffAt` の大会（URC など）では `null` になるため使わない。
2. 定数を足す: `const EVENT_RETRY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;`
3. `eventMatches` の絞り込みの最後の条件を、次の 3 つのどれかにする:
   - `record.statusChangedToFinished`（今まで）
   - `source.fetchEventMatches !== undefined`（今まで）
   - **新規:** `kickoffAtById` のキックオフが `now - EVENT_RETRY_WINDOW_MS <= kickoff <= now`
   - `now` は関数の引数で受け取れるようにし（既定値 `new Date()`）、テストから時刻を渡せるようにする。
4. 取り直しで得点イベントが 0 件だった場合のログ（`:453`）は今のまま（今度は本当に次の回で再試行される）。

### 取り込みの量について

- 取り直す試合は、同じ回に取得済みのページの HTML（`rawHtml`）を解析するだけで、新しい通信は増えない。
- 増える DB の読み込みは、1 大会につき `matches` の 1 回（`finishedRecordIds` が数百件でも `in` 1 回）。

## UI サーフェス

なし。

## LLM 連携

なし（得点イベントが入った試合は、その後の通常のレビュー生成の対象になる）。

## 受け入れ条件

1. **取り直す:** `fetchEventMatches` の無い大会で、`status = "finished"`・`statusChangedToFinished = false`・得点イベント 0 件・キックオフが `now` の 2 日前の試合。HTML に得点者があり合計がスコアと合う → `upsertMatchEvents` が 1 回呼ばれる。
2. **取り直さない:**
   - キックオフが `now` の 7 日と 1 分前 → 呼ばれない
   - すでに得点イベントがある試合 → 呼ばれない
   - 合計がスコアと合わない → 呼ばれない（今の照合のまま）
3. **今までの動き:** `statusChangedToFinished = true` の試合は、キックオフの時刻にかかわらず今までどおり試す。`fetchEventMatches` がある大会の動きは変わらない。
4. **キックオフが `null` の大会:** `preserveExistingKickoffAt` の大会（`resolvedMatches` の `kickoffAt` が `null`）でも、DB の `kickoff_at` で判定して受け入れ条件 1 が成り立つ。
5. **壊して落ちる確認（コミットしない）:**
   - 新しい条件を外すと、受け入れ条件 1 のテストが落ちること
   - 7 日の判定を外すと、受け入れ条件 2 の 1 つ目のテストが落ちること
6. `pnpm lint`、`pnpm typecheck`、`pnpm test` が通る。**3 つとも実行して、結果を完了報告に含める。**

## マージ後の確認（Claude Code が行う）

7. 次の週末のプレミアシップの試合で、試合の翌日までに得点イベントが入っていること（Fill Event Gaps を待たずに）。
8. URC は、Wikipedia の得点者の欄が埋まった試合から得点イベントが入ること。

## 別件の気づき（この spec では直さない）

- `live-ingest.ts:426-428` で、`resolvedMatches[record.candidateIndex]` と `parsedMatches[record.candidateIndex]` を同じ添え字で引いている。`resolvedMatches` は `parsedMatches` から未登録のチームの試合を除いたもの（`flatMap`）なので、除かれた試合があると添え字がずれる。影響するのは `fetchEventMatches` がある大会（NC・リポビタン D）の得点イベントの HTML の引き当てで、ずれても合計とスコアの照合で多くは弾かれるが、別試合の得点イベントを拾う経路になりうる。Owner の判断で別に扱う。

## 未解決の質問

なし。
