# JRFU 放送ページの紐付けを現地開催日で行う

## 背景

**放送情報の自動取り込みが 2026-08-18 を最後に1件も成立していない。** `match_broadcasts` は全期間で27行・12試合ぶんしかなく、**今後90日の114試合すべてで放送情報がゼロ**である（2026-09-11 本番実測）。

**cron は毎日走り、毎回 success を返している。** `.github/workflows/cron-ingest-broadcasts.yml`（`15 3 * * *` = 12:15 JST）は `curl -fsS` が 200 を受け取った時点で成功扱いになる。2026-09-11 の応答は次のとおり。

```json
{"generatedAt":"2026-09-11T08:00:54.366Z","linked":[],"matchesStillMissing":[…20件…],"unknownServices":[],"unlinkedPages":[…3件…]}
```

**`linked` が空でも成功として報告される。** 3週間気づけなかった。

### 紐付けが0件になる理由

`unlinkedPages` の3件は、**日付の解釈には成功していて**、理由はすべて「一致する日本代表戦が0件です」だった。

| JRFU の `dateLabel` | ソース | DB の該当試合（JST） | 差 |
|---|---|---|---|
| `11.07 Sat` | `rugby-japan.jp/match/30145` | 2026-11-**08** Sun 01:40 ウェールズ×日本 | **1日ずれ** |
| `11.14 Sat` | `rugby-japan.jp/match/30146` | 2026-11-**15** Sun 01:40 イングランド×日本 | **1日ずれ** |
| `09.19 Sat` | `rugby-japan.jp/match/30785` | **該当なし** | 別問題（後述） |

`lib/broadcasts/ingest.ts:276-279` は次の比較をしている。

```ts
const candidates = date
  ? scheduledMatches.filter(
      (match) =>
        isJapanMatch(match) && getJstDate(match.kickoffAt) === date,
    )
  : [];
```

`getJstDate`（`:103`）は `Asia/Tokyo` の暦日を返す。一方 `parseJrfuDate`（`:126`）が返すのは **JRFU が掲載している現地開催日**である。

**ウェールズ戦の JST 11/8 01:40 は、現地では 11/7(土) 16:40 である。** 欧州・南北アメリカ開催の日本代表戦は JST で翌日未明になるため、**暦日が必ず1日ずれ、`candidates.length === 0` になる。** 国内開催のときだけ偶然一致していた。

**これは特定の試合の不具合ではなく、開催地が日本より西にある全試合で再現する構造である。** 2026年11月の欧州遠征3戦（ウェールズ・イングランド・スコットランド）はすべてこれに該当する。

## スコープ

対象:

- `lib/broadcasts/ingest.ts` の日付突き合わせを、JST 暦日の完全一致から**現地開催日を許容する窓**に変える
- `cron-ingest-broadcasts` が **`linked` 0件を成功として報告しない**ようにする

対象外:

- **`09.19 Sat`（`rugby-japan.jp/match/30785`）に対応する試合が `matches` に無い問題。** これは放送の紐付けではなく日程取り込みの欠落であり、本 spec では直らない。Owner が何の試合かを確認したうえで別途扱う
- **日本代表戦以外の放送情報。** `isJapanMatch`（`:136`）の制約により、URC・プレミアシップ・Top 14・ネーションズチャンピオンシップの110試合は JRFU 経由では取得できない。第2ソースの検討は別 spec
- `resolveBroadcastService` / `unknownServices` の扱い（現在0件で問題が出ていない）
- 放送情報の表示 UI

## データモデル変更

なし。

## API サーフェス

新規ルートなし。`POST /api/cron/ingest-broadcasts` の**レスポンス形式も変えない**。紐付けの判定条件だけが変わる。

## 判定ロジック（この定義に従って実装すること）

**JRFU の日付を JST に変換しようとしないこと。** 会場のタイムゾーンは `match_broadcasts` の取り込みが読む列に含まれておらず（`:167-168` の `select` に `venue` は無い）、`resolveVenueTimezone`（`lib/format/venue-timezone.ts:106`）は会場名が未知だと `null` を返す。**タイムゾーン解決に依存しない方法を採る。**

代わりに、**JST 暦日が JRFU の現地日付の「当日または翌日」であることを許容する。**

```ts
// JRFU の現地開催日 date に対し、JST の暦日は date か date+1 のどちらかになる。
// - 欧州・南北アメリカ開催（日本より西）: 現地土曜の夕方 → JST 日曜未明 = date + 1
// - 国内・豪州・NZ・フィジー開催（日本と同じか東）: JST の暦日は date と同じ
const allowedJstDates = new Set([date, addDays(date, 1)]);
const candidates = scheduledMatches.filter(
  (match) =>
    isJapanMatch(match) && allowedJstDates.has(getJstDate(match.kickoffAt)),
);
```

**`date - 1` を許容しないこと。** 日本より東の会場で JST が現地日付より前になるのは、現地 00:30 以前のキックオフに限られ、ラグビーでは起こらない。窓を広げるほど誤結合の危険が増える。

**`candidates.length !== 1` のときに `unlinkedPages` へ送る既存の分岐は必ず残すこと**（`:281-290`）。窓を2日に広げても、日本代表は週1試合しか行わないため通常は1件に定まる。2件以上になったら**紐付けずに報告する**のが正しい。

### 検算（この4件をユニットテストにすること）

| JRFU `dateLabel` | 試合の `kickoff_at`(UTC) | その JST 暦日 | 期待 |
|---|---|---|---|
| # | JRFU `dateLabel` | 試合の `kickoff_at`(UTC) | その JST 暦日 | 期待 | 現行実装 |
|---|---|---|---|---|---|
| 1 | `11.07 Sat` | `2026-11-07T16:40:00Z` | 2026-11-08 | **紐付く**（date+1） | **落ちる（RED）** |
| 2 | `09.05 Sat` | `2026-09-05T05:50:00Z` | 2026-09-05 | **紐付く**（date と同じ） | 通る（既存動作の保護） |
| 3 | `11.07 Sat` | `2026-11-09T16:40:00Z` | 2026-11-10 | **紐付かない**（窓の外） | 通る（誤結合防止の保護） |
| 4 | `11.07 Sat` | 日本代表戦が2件: JST 2026-11-07 と 2026-11-08 | — | **紐付かず `unlinkedPages` に入る** | **落ちる（RED）** |

**RED になるのは1と4だけである。** 2と3は実装前後とも通り、既存の正しい挙動を壊していないことを保護する。

**4 の構成を間違えないこと。** 2件とも JST 2026-11-07 に置くと、現行実装でも候補2件になって通ってしまい RED にならない。**片方を `date`、もう片方を `date + 1` に置く。** 現行実装は完全一致なので `date` の1件だけを見て**誤って紐付ける**。新実装は窓に2件見えるので紐付けない。**この差が4の存在意義である。**

## 0件を成功として報告しない

**`linked` が0件で、かつ `unlinkedPages` か `matchesStillMissing` が1件以上あるとき、エンドポイントは成功を返してはいけない。**

`app/api/cron/ingest-broadcasts/route.ts` のレスポンス本文は変えず、**HTTP ステータスを 500 にする**。`.github/workflows/cron-ingest-broadcasts.yml` は `curl -fsS` を使っているため、ステータスが 500 になればワークフローが失敗し、気づける。

**`linked` 0件でも `unlinkedPages` と `matchesStillMissing` が両方0件なら成功でよい。** 対象試合が無い期間（シーズンオフ）に毎日失敗通知を出さないため。

## 受け入れ条件

1. `lib/broadcasts/ingest.ts` の候補抽出が、JST 暦日の完全一致ではなく「JRFU の日付またはその翌日」で判定している
2. 上の「検算」表の4件がユニットテストとして存在し、パスする。**`now` と `kickoff_at` を明示的に与えて判定すること**
3. `date - 1` を許容していない（`2026-11-06` の JST 暦日を持つ試合が `11.07 Sat` に紐付かないテストがある）。**これも実装前後とも通る保護テストである**
4. `candidates.length !== 1` のとき `unlinkedPages` に送る分岐が残っており、2件ヒット時に紐付けが起きないテストがある
5. `isJapanMatch` の条件を緩めていない（日本代表戦以外を紐付けない）
6. `parseJrfuDate` / `getJstDate` / `resolveBroadcastService` のシグネチャと戻り値が変わっていない
7. `POST /api/cron/ingest-broadcasts` が、`linked` 0件かつ（`unlinkedPages` > 0 または `matchesStillMissing` > 0）のとき **HTTP 500** を返す。レスポンス本文の形は変えない
8. `linked` 0件かつ `unlinkedPages` 0件かつ `matchesStillMissing` 0件のとき **HTTP 200** を返すテストがある
9. `linked` が1件以上のとき **HTTP 200** を返すテストがある
10. `.github/workflows/cron-ingest-broadcasts.yml` に差分が無い（`curl -fsS` が既に非200で失敗するため変更不要）
11. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

## 検証（PR 本文に書くこと）

- 検算表の **1 と 4 が現行実装で落ちることを先に確認**してから実装したか（RED → GREEN）。**2 と 3 は実装前後とも通る保護テストであり、RED にはならない**
- 受け入れ条件7・8・9の3分岐を、それぞれどのモック入力で確認したか
- **`09.19 Sat` は本 spec では紐付かないままであること**を明記すること。これを「直った」と報告しないこと

## デプロイ後に Owner が確認すること

- 翌日 12:15 JST の `cron-ingest-broadcasts` が `linked` に**11/7 ウェールズ戦と11/14 イングランド戦を含む**こと
- 同 run が 500 で失敗しなくなること（`09.19` が残るため `unlinkedPages` は1件のまま。**`linked` が1件以上あれば200になる**）

## 未解決の質問

- **`rugby-japan.jp/match/30785`（09.19 Sat）が何の試合か。** Bing で「リポビタンdチャレンジカップ 9/19」が2表示2クリック（CTR 100%、順位4位）と実際に検索されており、**サイトに試合そのものが無い。** 日程取り込みの欠落として別途対応が要る
- **日本代表戦以外の110試合の放送情報をどこから取るか。** Bing の実測で「放送・視聴」意図は CTR 75%、「日程」は 67% と最も高い。現在はどちらも日本代表戦しか答えられない
