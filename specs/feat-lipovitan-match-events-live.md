# リポビタンD戦の得点イベントを試合終了と同時に取り込む

## 背景

`feat-lipovitan-challenge-cup-live-ingestion.md`（PR #671、マージ済み）により、リポビタンDチャレンジカップのスコアは自動更新されるようになった。しかし**得点イベントは依然として取り込まれない**ため、recap の自動生成が成立しない。

`lib/llm/pipeline.ts` はイベント0件の recap を `skipped` で返す。したがって 2026-08-15 の第2戦（オーストラリア vs 日本、タウンズビル）でも、レビュー記事だけは手作業が残る。

### 原因

`lib/ingestion/live-ingest.ts` は、ステータスが `finished` へ変わった試合に対しイベント解析を行う（305-330行）。

```ts
const rawHtml = eventMatch?.rawHtml ?? match?.rawHtml;

if (!match || !rawHtml) {
  continue;
}
```

`lib/ingestion/sources/wikipedia-lipovitan-challenge-cup.ts`（PR #671 で追加）は `rawHtml: ""` を返す。**空文字は falsy のため、この分岐で必ず `continue` する。**

アダプタが空文字を渡しているのは、既存スクレイパーの戻り値型 `LipovitanChallengeCupMatchResult` が HTML を保持しないためである。PR #671 は「既存スクレイパーを書き換えない」方針を採ったので、アダプタには渡せるものが無かった。

### 既存の解決パターンがある

`LiveCompetitionSource` には **`fetchEventMatches?: () => Promise<ParsedLiveMatch[]>`** というオプションが既に定義されている（`live-ingest.ts:21`）。

Nations Championship 2026 がこれを使っている（`live-competitions.ts:58`、`fetchNationsChampionship2026EventMatches`）。日程・スコアの取得元とイベントの取得元を分離するための仕組みで、**まさに本件のための構造**である。

`live-ingest.ts:232-241` で `fetchEventMatches` の結果を `buildParsedMatchKey` でキー化し、312-314行で試合ごとに引き当てて `rawHtml` として使う。

**したがって既存スクレイパーにもアダプタにも手を入れず、イベント専用ソースを1本追加して登録するだけでよい。**

### 取得元は英語版 Wikipedia

2026-08-09 の実測で、**英語版のシリーズ記事から19イベントが正しく取得できる**ことを確認済みである（日本 32-35 オーストラリア、合計がスコアと一致）。

- 英語版: `https://en.wikipedia.org/wiki/2026_Australia–Japan_rugby_union_test_series` → `parseMatchEventsFromVeventHtml` で解析可能
- 日本語版: 得点者と分表示は存在するが vevent 構造でないため `no unique event block found` となり解析不能

PR #671 により、日豪シリーズの試合には `external_ids.wikipedia_url` として英語版が設定されている。同じ URL 定数（`AUSTRALIA_JAPAN_WIKIPEDIA_URL`、既に export 済み）を再利用できる。

## スコープ

対象:
- リポビタンDチャレンジカップ用のイベント専用ソースを追加する
- `lib/ingestion/live-competitions.ts` の該当エントリに `fetchEventMatches` を設定する

- **`lib/ingestion/live-ingest.ts` のイベント解析対象を広げる**（2026-08-09 追記。下記「再試行の必要性」参照）

対象外:
- `lib/scrapers/wikipedia-lipovitan-challenge-cup-results.ts` の変更（PR #671 の方針を維持）
- `lib/ingestion/sources/wikipedia-lipovitan-challenge-cup.ts` の `rawHtml` を空文字から変える改修（イベント専用ソース側で解決するため不要）
- `lib/ingestion/live-ingest.ts` の**解析ロジック本体**の変更（対象の絞り込み条件のみを変える）
- DB 全体から「イベント未登録の finished 試合」を探す処理（`fill-event-gaps` の役割。重複させない）
- `app/api/cron/fill-event-gaps/route.ts` および `scripts/fill-event-gaps.ts`（`fix-fill-event-gaps-reliability.md` で別途扱う）
- `parseMatchEventsFromVeventHtml` の ja.wikipedia 対応
- カナダ戦・フィジー戦のイベント取得（英語版の該当記事が存在するか未確認。下記「未解決の質問」参照）

## データモデル変更

**なし。マイグレーション不要。**

## API サーフェス

### イベント専用ソースの追加

`lib/ingestion/sources/wikipedia-nations-championship-events.ts` を**そのままの構造で**踏襲すること。同モジュールが唯一の前例であり、独自の設計を持ち込む必要はない。

返す `ParsedLiveMatch` は、`buildParsedMatchKey` で日程ソース側の試合と引き当てられる必要がある。**キーの構成要素が一致するように値を埋めること**（実装時に `buildParsedMatchKey` を読んで確認する）。

`rawHtml` には英語版シリーズ記事の HTML を入れる。取得は `fetchWithPolicy` を使う（robots 判定・リトライ・レート制限）。

ページが取得できない場合は例外を投げず空配列を返す（`isMissingWikipediaPage` の既存パターン）。

### 登録

`lib/ingestion/live-competitions.ts` の `lipovitan-challenge-cup-2026` エントリに `fetchEventMatches` を追加する。Nations Championship のエントリ（58行目）が記法の参考になる。

### 再試行の必要性（2026-08-09 追記・重要）

イベント専用ソースを足すだけでは不十分である。

`live-ingest.ts:305-307` は解析対象を `statusChangedToFinished` の試合に限定している。このフラグは**一度しか立たない**。

PR #671 の設計では**スコアの取得元は日本語版 Wikipedia** である。2026-08-08 の実測では、試合終了2時間後の時点で日本語版には既にスコアがあり、**英語版はメンバー表のみでスコアも得点者も無かった**。英語版に得点者が載ったのはさらに後である。

つまりステータスが `finished` へ変わるのは日本語版の更新によるもので、**その時点で英語版にはまだ得点者が無い**可能性が高い。この順序では、イベント取得の機会を構造的に逃す。稀に取りこぼすのではなく、**通常このパターンになる**。

したがって解析対象を広げる。

**ただし対象は `result.records`（当該取り込み実行の対象試合）に限定すること。** DB 全体から「finished かつイベント未登録」を探しに行ってはならない。それは `fill-event-gaps` の役割であり、重複させると**解析不能な22件を6時間ごとに取得し続ける**ことになる。レート制限の予算を無駄に消費する。

`result.records` は当該大会の試合に限られるため、対象は自然に数件へ収まる。

イベントが0件で終わった場合は**ログに残すこと**。何回試して取れていないかが分からないと運用側で判断できない。

## UI サーフェス

なし。

## LLM 連携

なし。イベント取り込みのみ。ただし本 spec が成立すると、試合終了後の巡回で recap 生成が自動的に走るようになる（`cron-live-pipeline` は ingest → orchestrate の順で実行するため）。

## 受け入れ条件

1. リポビタンD用のイベント専用ソースが追加され、`live-competitions.ts` の該当エントリに `fetchEventMatches` として登録されている。
2. `buildParsedMatchKey` により、イベントソースの結果が日程ソース側の試合と正しく引き当てられる。**引き当てが成立することをテストで担保する。**
3. 日豪シリーズの試合で `rawHtml` が空でなくなり、`live-ingest.ts:314-317` の分岐で `continue` されない。
4. 英語版ページが取得できない場合に例外を投げず空配列を返す。
5. `lib/scrapers/wikipedia-lipovitan-challenge-cup-results.ts` の解析ロジックが変更されていない。
6. `lib/ingestion/sources/wikipedia-lipovitan-challenge-cup.ts`（日程・スコア側）が変更されていない。
7. `lib/ingestion/live-ingest.ts` の変更が**解析対象の絞り込み条件のみ**にとどまり、解析ロジック本体が変わっていない。
8. **イベント未登録の finished 試合が、後続の巡回で再試行される。** `statusChangedToFinished` が既に消費された試合でも解析が走ることをテストで担保する。
9. **再試行の対象が `result.records` に限定されている。** DB 全体を走査する処理が無いことを確認する。
10. イベント0件で終わった場合にログが出る。
11. 他大会の取り込みに影響がない（既存テストが通る）。
12. **既存のスコア整合ガードが機能する。** イベント合計がスコアと合わない場合に登録されない挙動を弱めていないことを確認する（`dropReconciledPhantomEvents` および既存のガード）。
13. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` がすべて clean。

## 未解決の質問

1. **カナダ戦（9/5）・フィジー戦（10/24）のイベント取得元が未確認。** 日豪シリーズには専用の英語版記事があるが、他2試合は該当記事が存在しない可能性がある。存在しなければイベントは取得できず、これらの試合の recap は引き続き `fill-event-gaps` 頼みになる。実装時に確認し、無ければ日豪シリーズのみを対象として報告すること。

2. **イベント解析は `statusChangedToFinished` の試合にのみ走る。** 既に `finished` になっている 8/8 の試合は、本 spec を実施しても自動では埋まらない（既に手動で19件登録済みのため実害はない）。過去試合の補完は `fill-event-gaps` の役割である。

3. ~~英語版 Wikipedia の更新タイミングに依存する。~~ **解決済み（2026-08-09）。** Codex からの照会を受け、「再試行の必要性」節として本文へ格上げした。イベント専用ソースの追加だけでは通常のケースで取りこぼすため、`result.records` に限定した再試行を対象に含める。

4. **再試行が何回まで続くかの上限を設けていない。** 英語版に永久に得点者が載らない試合は、巡回のたびに取得を試み続ける。対象は `result.records` に限られるため件数は小さいが、将来大会が増えたときに見直しが要る可能性がある。実装時に上限や打ち切りが必要と判断したら報告すること。
