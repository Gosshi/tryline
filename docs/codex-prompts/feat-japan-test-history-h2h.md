# Codex 指示書: 日本代表戦の H2H を「見つけてもらう」＋「通算成績を出す」

仕様書: `specs/feat-japan-test-history-h2h.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コード・実ページが食い違ったら、実装を進めずその場で止めて Owner に確認する。

**締切: PR 1 はできるだけ早く。PR 2 は 10/17 までに本番で取り込み完了**（10/24 の日本 対 フィジー、11 月のウェールズ・イングランド・スコットランド戦の前に H2H を厚くするため）。

## PR は 2 つに分ける（順番厳守）

1. **PR 1「見つけてもらう」**（マイグレーションなし・先に出す）: 仕様書の「`listHeadToHeadPairs` の修正」と「IndexNow に H2H を足す」、受け入れ条件 23〜26
2. **PR 2「通算成績」**（マイグレーションあり）: それ以外すべて、受け入れ条件 1〜21

PR 1 だけで、11 月の相手の H2H がサイトマップと IndexNow に載るようになる。

### PR 1 の要点

- 2026-09-23 の URL 検査で、`/h2h/fiji-vs-japan` は「URL が Google に認識されていません」だった。`/h2h/japan-vs-wales` などはサイトマップにすら無い
- 原因: `listHeadToHeadPairs`（`lib/db/queries/matches.ts:2044`）が `matches` を件数指定なしで取る（**1,000 行上限で 2025-04-11 より前が落ちる**）うえ、試合数順に 200 ペアで切るので、クラブの対戦に押し出される
- 直し方: `loadAllPages` で全件（`.order("id")` も付ける）、**60 日以内に予定試合があるペアを先頭**に置く。上限 200 は変えない
- IndexNow: `lib/llm/pipeline.ts:860-887` で、preview 公開時に H2H 件数 2 以上なら H2H の URL も送る。recap では送らない
- テストの注意: 1,000 行以下のモックでは修正前も通る。**1 ページ目 1,000 行・2 ページ目 407 行**で書く

## 直したいこと（PR 2）

H2H ページ（例 `/h2h/japan-vs-wales`）は DB の `matches` だけから作っていて、日本 対 ウェールズは 1 試合しか出ない。実際のテストマッチは 13 試合ある。
Wikipedia の日本代表テストマッチ一覧から過去の結果を**別テーブル**に取り込み、H2H に通算成績と過去の全対戦を出す。**過去の試合を `matches` に入れてはいけない**（試合ページが数百件増える）。

## 触るファイル

新規:
- `supabase/migrations/<timestamp>_national_test_history.sql` — テーブル・一意制約・CHECK・RLS・SELECT ポリシー
- `lib/ingestion/sources/wikipedia-japan-test-history.ts` — `parseJapanTestHistory(wikitext)`（純粋関数）
- `scripts/import-japan-test-history.ts` — 既定 dry-run、`--apply` で upsert
- `tests/fixtures/wikipedia-japan-test-matches.wiki` — `https://en.wikipedia.org/wiki/List_of_Japan_national_rugby_union_test_matches?action=raw` を**そのまま保存**（手作りしない）
- `tests/ingestion/wikipedia-japan-test-history.test.ts`
- `tests/scripts/import-japan-test-history.test.ts`
- マイグレーションのテスト（既存の `tests/db-migrations-*.test.ts` と同じ形）

変更:
- `lib/db/queries/matches.ts` — `getHeadToHeadHistory` を追加、重複除外と通算の純粋関数、`countHeadToHeadMatches`（`:2179`）に履歴を足す、`getHeadToHeadPageData`（`:2148`）が履歴を返す
- `lib/db/types.ts` — 新テーブルの型
- `app/h2h/[pair]/page.tsx` — 通算成績・過去の対戦・出典・description・注意書き（`:166`）の出し分け
- `tests/app/h2h-page.test.tsx` — 受け入れ条件 13〜16

使う既存部品: `fetchWikipediaWikitext`・`stripWikitextMarkup`（`lib/ingestion/sources/wikipedia-wikitext.ts`）。スクリプトの形は既存の `scripts/import-*.ts` に合わせる。

## 照合元の書き方（2026-09-23 に確認）

表の列構成は 2 種類。**見出し行（`!`）を読んでから列を解釈する**こと。列の位置を決め打ちすると片方で壊れる。

```
! Date ! Opponent ! F ! A ! Venue ! City ! Winner                     ← 8 表（古い年代）
! Date ! Tournament ! Opponent ! F ! A ! Venue ! Winner ! Report       ← 2 表（新しい年代）
```

行の例（`City` 列がある型）:

```
|-bgcolor=<!---win--->
| 2013-06-15
| [[Wales national rugby union team|Wales]]
| 23
| 8
| [[Chichibunomiya Rugby Stadium]]
| [[Tokyo]]
| {{flagicon|JPN}}
```

A 代表・XV の行（**除外する**）:

```
| [[Wales national rugby union team|Wales XV]]
```

2026-09-23 取得分での正代表戦の数: Wales 13、England 6、Scotland 9、Fiji 22、United States 26。

## 処理すべきエッジケース

1. 列構成が 2 種類ある（上記）
2. セルは 1 行 1 セルが基本だが、`||` で 1 行に並べた行もある
3. 相手のリンクの表示名が国名と違う行（`Wales XV`・`England XV` など）は除外する
4. 得点が空・数字でない行（2027 年 RWC の予定など）は除外する
5. `teams` に無い相手（Arabian Gulf・Chinese Taipei など）は取り込まず、件数だけ出す。名前の違いは別名表で吸収（`Hong Kong` → `hong-kong-china`、`Chile` → `chile`）
6. 重複除外: 同じ 2 チームで、`matches.kickoff_at` の UTC 日付と `played_on` が 1 日以内なら同じ試合。**ホーム・アウェイが逆でも一致させる**（本番の 2025-11-15 はウェールズがホームで 24–23、一覧では日本側から 23–24）
7. 勝敗はページの `teamA` 側で数える（`japan-vs-wales` なら日本、`england-vs-japan` ならイングランドが teamA）
8. 履歴が無いペアの H2H は、DOM も description も今と同じ

## やってはいけないこと

- 過去の試合を `matches`・`competitions` に入れること
- 取り込みスクリプトを本番に対して実行すること（Owner が行う）
- Wikipedia の文章（本文・脚注）を保存・表示すること。日付・得点・会場・大会名だけ
- H2H ページの title を変えること
- マイグレーションで RLS を無効のままにすること

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test`（**型チェックも必ず実行し、結果を完了報告に含める**）
- 受け入れ条件 18: 「表示名を見ずにリンク先だけで判定する実装」「重複を除外しない実装」で一時的に壊し、テストが落ちることを確認して PR 本文に書く（コミットしない）
- 本番の手順（受け入れ条件 21）は PR 本文に手順として書く。実行はしない

## 完了時

- PR 本文に: 変更ファイル一覧、受け入れ条件 1〜20 それぞれの確認方法と結果、「壊して落ちた」確認の内容、dry-run をローカル（fixture）で実行したときの相手別件数、本番の手順
- **マイグレーションを含むので、PR 本文の先頭に「マージ前に Owner がマイグレーションを本番適用すること」と書く**
- PR 作成まで。マージはしない
