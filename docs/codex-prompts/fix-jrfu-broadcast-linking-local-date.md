# Codex プロンプト: fix-jrfu-broadcast-linking-local-date

`specs/fix-jrfu-broadcast-linking-local-date.md` の受け入れ条件に従って実装してください。**仕様の内容をここで繰り返しません。先に spec を全文読んでください。**

## やること（2点）

1. `lib/broadcasts/ingest.ts` の日付突き合わせを「JRFU の現地日付またはその翌日」に変える
2. `app/api/cron/ingest-broadcasts/route.ts` が、1件も紐付かなかったのに未処理が残っているとき HTTP 500 を返すようにする

## 先に読むファイル

```
specs/fix-jrfu-broadcast-linking-local-date.md
lib/broadcasts/ingest.ts                        ← :103 getJstDate / :126 parseJrfuDate / :276 候補抽出
app/api/cron/ingest-broadcasts/route.ts
.github/workflows/cron-ingest-broadcasts.yml    ← 読むだけ。変更しない
```

## 一番間違えやすいところ

**JRFU の日付を JST に変換しようとしないでください。**

会場のタイムゾーンは使えません。`loadScheduledMatches` の `select`（`:167-168`）に `venue` 列が含まれておらず、`resolveVenueTimezone`（`lib/format/venue-timezone.ts:106`）は未知の会場名に `null` を返します。**列を足してタイムゾーンを解決する方向に広げないでください。** spec は意図的にその依存を避けています。

**`date - 1` を許容しないでください。** 「前後1日」と読み替えたくなりますが、許すのは **`date` と `date + 1` の2つだけ**です。日本より東の会場で JST が現地日付より前になるのは現地 00:30 以前のキックオフに限られ、ラグビーでは起こりません。窓を広げるほど誤結合が増えます。受け入れ条件3はこれを落とすためのテストです。

**`candidates.length !== 1` の分岐（`:281-290`）を消さないでください。** 窓を2日に広げるので、ここが唯一の誤結合の歯止めです。2件ヒットしたら**紐付けずに `unlinkedPages` へ送る**のが正しい挙動です。「どちらか近いほうを選ぶ」ような実装にしないでください。

## 500 を返す条件を正確に

| linked | unlinkedPages | matchesStillMissing | ステータス |
|---|---|---|---|
| 0件 | 1件以上 **または** | 1件以上 | **500** |
| 0件 | 0件 | 0件 | **200** |
| 1件以上 | 何件でも | 何件でも | **200** |

**シーズンオフに毎日失敗通知を出さないための 0/0/0 = 200 です。** ここを「linked が0なら常に500」にしないでください。

**レスポンス本文の形は変えないでください。** `{"result":{generatedAt, linked, matchesStillMissing, unknownServices, unlinkedPages}}` のまま、ステータスだけ変えます。

## テストは RED から始めてください（2026-09-12 訂正）

**RED になるのは検算表の 1 と 4 だけです。** 初版は「1件目・3件目が落ちる」と書いていましたが誤りでした。指摘のとおり3件目は実装前後とも通ります。

| # | 内容 | 現行実装 |
|---|---|---|
| 1 | `11.07 Sat` → JST 11/08 の試合が紐付く | **落ちる（RED）** |
| 2 | `09.05 Sat` → JST 09/05 の国内戦が紐付く | 通る（既存動作の保護） |
| 3 | `11.07 Sat` → JST 11/10 の試合は紐付かない | 通る（誤結合防止の保護） |
| 4 | 窓の中に日本代表戦が2件あると紐付かない | **落ちる（RED）** |

**4 の構成を間違えないでください。** 2件とも JST 2026-11-07 に置くと、現行実装でも候補2件になって通ってしまい RED になりません。**片方を `date`（2026-11-07）、もう片方を `date + 1`（2026-11-08）に置いてください。**

現行実装は完全一致なので `date` の1件だけを見て**誤って紐付けます**。新実装は窓に2件見えるので `unlinkedPages` に送ります。**この差が4の存在意義です。**

先に 1 と 4 を書いて落ちることを確認してから実装し、PR 本文にその出力を貼ってください。**2 と 3 は RED にならなくて構いません。**

## 触ってはいけないもの

```
.github/workflows/cron-ingest-broadcasts.yml     curl -fsS が既に非200で失敗するので変更不要
lib/format/venue-timezone.ts
isJapanMatch（lib/broadcasts/ingest.ts:136）      日本代表戦以外を紐付けない制約は維持する
resolveBroadcastService / unknownServices の扱い
```

## 直らないものを直ったと書かないでください

**`09.19 Sat`（`rugby-japan.jp/match/30785`）は本 spec では紐付きません。** 対応する試合が `matches` テーブルに存在しないためで、日付判定の問題ではありません。

デプロイ後も `unlinkedPages` はこの1件が残ります。**PR 本文に「09.19 は残る」と明記してください。** 「unlinkedPages が0件になる」と書かないでください。

## 完了の定義

1. spec の受け入れ条件11項目すべてを満たす
2. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
3. PR 本文に次を貼る
   1. 検算表の 1 と 4 が実装前に落ちた出力（RED → GREEN）。**2 と 3 は保護テストなので RED でなくてよい**
   2. 受け入れ条件7・8・9の3分岐それぞれのモック入力と結果
   3. 「09.19 Sat は本 PR では紐付かない」の明記

**期待値を手で書き写さないでください。** 実際にテストを走らせた出力を貼ってください。
