# Wikipedia 取り込みを wikitext へ移行（第1弾: Premiership）

## 背景

判断の経緯は `docs/decisions.md` の **D016** に記録済み。要点のみ再掲する。

現行の Wikipedia 系パーサ15本は**レンダリング後の HTML** に依存している。`lib/ingestion/sources/wikipedia-top-14.ts:15` の例:

```ts
const ROUND_ID_PATTERN = /^Round_(\d+)$/;   // 見出しの id に依存
```

見出し `id`、`div.mw-heading`、テーブルの列順といった表示側の都合に結び付いているため、Wikipedia の書式変更で壊れる。過去の事故（`[edit]` / `[edit source]` の表記ゆれによる `matches_updated: 0`、Parsoid 対応、ja.wikipedia の書式非対応）はすべてこの層に起因する。

DB との件数差は次のとおり（2026-08-12 実測）。**ただしこの差の原因は HTML パースではなかった**（下記「なぜ Premiership を第1弾にするか」の訂正を参照）:

| 大会 | wikitext の `{{rugbybox}}` | DB | 差 |
|---|---|---|---|
| **Premiership 2025-26** | **93** | **75** | **-18** |
| URC 2025-26 | 151 | 150 | ほぼ一致 |
| Six Nations 2026 | 15 | 15 | 一致 |
| SRP 2026（2ページ合算） | 77 + 6 = 83 | 83 | 一致 |

Premiership の欠落は特定期間ではなく**毎月1〜3試合ずつ**発生している（9月-1 / 10月-3 / 11月-1 / 12月-2 / 1月-2 / 3月-2 / 4月-2 / 5月-3 / 6月-1）。これは**1チーム（ニューカッスル）が毎月1〜3試合するためで**、月別に散らばって見えたことが原因の誤診につながった。**エラーも警告も出ずに欠落する**点は事実で、そこは移行と独立に塞ぐ必要がある。

### なぜ Premiership を第1弾にするか

D016 決定6により段階移行とする。件数が一致している大会（Six Nations 等）では「変わらないこと」しか確認できないため、差分のある Premiership を最初に選ぶ。

**注意（2026-08-13 訂正）: この差18は本移行では解消しない。** 当初「HTML パーサが落としている」と分析していたが誤りで、`parsePremiershipLiveHtml` は現在のページで93件を返す。**実際の原因は2025-26シーズンのニューカッスル改称（Newcastle Red Bulls）にチーム名マップが対応しておらず、18試合すべてが黙って捨てられていたこと。** 詳細と復旧方針は D016 を参照。

**本 spec の価値は「表示形式の変更に壊されないこと」であり、欠落試合の復旧ではない。** 受け入れ条件1の「93試合が得られる」はパーサの出力を検証するものであって、DB が93件になることを意味しない。

月別の内訳（2026-08-12 実測。DB は `premiership-2025-26` の `kickoff_at` を UTC 月で集計）:

| 月 | wikitext | DB | 差 |
|---|---|---|---|
| 2025-09 | 5 | 4 | -1 |
| 2025-10 | 19 | 16 | -3 |
| 2025-11 | 5 | 4 | -1 |
| 2025-12 | 10 | 8 | -2 |
| 2026-01 | 10 | 8 | -2 |
| 2026-03 | 10 | 8 | -2 |
| 2026-04 | 10 | 8 | -2 |
| 2026-05 | 15 | 12 | -3 |
| 2026-06 | 8 | 7 | -1 |
| **合計** | **93** | **75** | **-18** |

## スコープ

対象:
- wikitext 取得と `{{rugbybox}}` 解析の**共通ユーティリティを新設**する（後続8大会が再利用する前提で設計する）
- `lib/ingestion/sources/wikipedia-premiership.ts`（153行）を、その共通基盤を使う実装へ置き換える

対象外:
- **Premiership 以外の大会**（URC / SRP / Nations Championship / Autumn Nations / Six Nations / Rugby Championship / PNC / Greatest Rivalry）。共通基盤は再利用可能に作るが、**移行は本 spec では行わない**（D016 決定6）
- **RWC / Top 14 / リーグワン**（D016 決定3・4・5 により恒久的に対象外）
- 得点イベント（`match_events`）の取り込み統合。`try1` / `con1` / `pen1` から取れる見込みはあるが、本 spec では**日程・スコア・会場のみ**に絞る
- 過去シーズンのバックフィル（URC 2024-25 等）
- 週次監査への試合数異常検知の追加
- `lib/scrapers/fetcher.ts` の共通ポリシー層の変更

## データモデル変更

**なし。マイグレーション不要。** 既存の `matches` への upsert 経路をそのまま使う。

## API サーフェス

**変更なし。** 取り込みは cron 経由の内部処理で、公開 API に影響しない。

## 実装詳細

### 1. wikitext 取得ユーティリティ（新規・共通）

#### robots.txt の制約（重要・初版から変更）

**本 spec の初版は MediaWiki API（`/w/api.php?action=query&prop=revisions`）を指定していたが、これは robots.txt 違反で誤りだった。** 実装時に `RobotsDisallowedError` で停止して発覚している。経緯と根拠は `docs/decisions.md` の D016 に記録済み。

`en.wikipedia.org/robots.txt` の `User-agent: *` は `Disallow: /w/` と `Disallow: /api/` を持ち、`/w/` の許可例外は `action=mobileview` だけである。**したがって MediaWiki API も REST API も使えない。**

**`/wiki/{ページ名}?action=raw` を使う。** `/wiki/` 配下は Disallow の対象外で（`Special:` 等の個別禁止を除く）、同じ wikitext が `Content-Type: text/x-wiki` のプレーンテキストで返る。実装が使っている `robots-parser` で許可されることを検証済み。

```
GET https://en.wikipedia.org/wiki/<ページ名>?action=raw
```

- **レスポンスは JSON ではなくプレーンな wikitext。** そのまま本文として扱う（`response.text()`）
- **`skipRobotsCheck` を使ってはならない。** 設計不変条件「robots.txt は常に尊重」に反する。robots で弾かれる経路は、仕様に書いてあっても実装せず停止して報告すること

#### 取得の共通ルール

- **取得は既存の `fetchWithPolicy`（`lib/scrapers/fetcher.ts`）を通す。** レート制限・User-Agent・robots の扱いを共通化するため、独自に `fetch` を呼ばない
- **ページが存在しない場合は 404 が返る。** 既存の `isMissingWikipediaPage`（`lib/ingestion/sources/live-source-utils.ts`）と同じ扱いにする。**API 版と違い、不在は HTTP ステータスで判別する**点に注意
- ページ名は現行パーサの URL 生成から流用する。**ダッシュは en dash（`–`, U+2013）**である点に注意（`2025–26 Premiership Rugby`）。空白は `_` に、非 ASCII は URL エンコードする
- **複数ページを取る大会が後続にある**（SRP は `List of ...` と本文、Nations Championship は南北2ページ）。`?action=raw` は1リクエスト1ページなので、**複数ページを順に取得して結合できるインターフェースにしておく**。結合時もレート制限（`fetchWithPolicy` の既定3秒間隔）を守る

### 2. `{{rugbybox}}` パーサ（新規・共通）

wikitext から `{{rugbybox` を検出し、名前付きパラメータを抽出する。**以下はすべて 2026-08-12 に移行対象7ページの実データで確認した事実**であり、推測ではない。

#### テンプレート名は大文字小文字が揺れる

`{{Rugbybox` と `{{rugbybox` の両方が実在する。Premiership は93件すべて `Rugbybox`、URC は151件すべて `rugbybox`、**PNC は同一ページ内で混在**。**大文字小文字を区別せずに検出する。**

#### チームのパラメータ名は2種類ある（初版の誤り）

**初版は `team1` / `team2` のみを対象としていたが、これは誤りだった。** Premiership は `home` / `away` を使っており、そのまま実装すると93件すべてでチームが解決できず取り込み0件になる。実装時に Codex が発見して停止した。

実測（移行対象のうち7ページ）:

| ページ | 件数 | チームのキー |
|---|---|---|
| Premiership 2025-26 | 93 | **`home` / `away`** |
| SRP 2026（`List of ...`） | 77 | **`home` / `away`** |
| Rugby Championship 2025 | 12 | **`home` / `away`** |
| PNC 2025 | 11 | **`home` / `away`** |
| URC 2025-26 | 151 | `team1` / `team2` |
| Six Nations 2026 | 15 | `team1` / `team2` |
| Nations Championship 2026 北 | 18 | `team1` / `team2` |

**両方を正式な別名として扱う**（`home` ?? `team1`、`away` ?? `team2`）。移行対象9大会が両形式に分かれているため、第1弾の時点で両対応が必須。

**他のパラメータに別名の揺れはない。** `date` / `time` / `score` / `stadium` は7ページすべてで100%この名前だった（`venue` / `city` / `location` は0件）。

#### 値の書式

- **入れ子テンプレートを正しく扱うこと。** 値の中に別テンプレートが入る。`}}` の単純検索では途中で切れるため、**波括弧の深さを数えて対応する終端を見つける**
- **リンクは表示テキストを採る。リンク先ではない。** これは必須で、誤ると解決に失敗する
  - `[[Sale Sharks]]` → `Sale Sharks`
  - `[[Gloucester Rugby|Gloucester]]` → **`Gloucester`**（`Gloucester Rugby` ではない）
  - `[[Saracens F.C.|Saracens]]` → **`Saracens`**。**リンク先の `Saracens F.C.` は既存マップに存在しない**ため、リンク先を採ると解決に失敗する
- チームテンプレートは大会ごとに違う。**いずれも第1引数がチームを表す**
  - `{{ru|IRE}}` / `{{ru-rt|FRA}}` → `IRE` / `FRA`（Six Nations・PNC・NC）
  - `{{Rut|Highlanders}}` → `Highlanders`（SRP）
- **`{{flagicon|...}}` は装飾なので除去する。** URC は `(1 BP) [[Stormers]] {{flagicon|RSA}}` のようにチームのリンクと国旗テンプレートが**併存**する。「テンプレート部分を取り出す」と国旗の国コードを拾ってしまう
- `<br />` と `<ref>...</ref>` の除去
- 本 spec で抽出するのは **`date` / `time` / チーム（`home`\|`team1`・`away`\|`team2`） / `score` / `stadium`** のみ

### 3. 値の正規化

- **日付**: `5 February 2026` 形式。既存の `parseDmyDate`（`live-source-utils.ts`）が使えるか確認し、使えなければ拡張する。**`date` 自体がリンクになっている試合が実在する**（Premiership に1件: `date = [[East Midlands Derby (rugby union)|11 October 2025]]`）。**上記「リンクは表示テキストを採る」を `date` にも適用すれば解ける**。適用しないとこの1件だけ落ちる
- **時刻とタイムゾーン**: 書式が大会ごとに違う。**Premiership は `19:45` のように時刻のみでタイムゾーン表記が無い**（英国時間、夏時間の判定が必要）。他大会は `21:10 [[Central European Time|CET]]` や `19:05 [[Time in New Zealand|NZDT]] ([[UTC+13]])` のようにリンク付きで入る
  - **Premiership では既存の `parsePremiershipKickoffAt`（`lib/scrapers/premiership-kickoff.ts`）をそのまま使う。** この関数は `"25 September 2025 19:45"` のような結合文字列を受け取り、**BST / GMT の切り替えを内部で判定する**。**`date` と `time` を連結して渡せば現行と同一の結果になる**ため、タイムゾーン処理を新規に書かない
  - **時刻が無い試合もありうる**ので、その場合の扱いを現行実装に合わせる（`parsePremiershipKickoffAt` は時刻省略時 `00:00` を使う）
- **スコア**: `36–14` は **en dash** でありハイフンではない。既存の `parseScoreText` が en dash を扱えるか確認する。未開催の試合はスコアが空
- **チーム**: **ボーナス点表記 `(1 BP)` は接頭辞にも接尾辞にも付く**（`(1 BP) [[Northampton Saints]]` と `[[Leicester Tigers]] (1 BP)` が同一ブロック内に実在する）。**両方の位置で除去する。** チーム名から slug への対応は**現行 `wikipedia-premiership.ts` の `TEAM_SLUG_BY_WIKIPEDIA_NAME`（19エントリ）を流用**し、新規に作り直さない

### 4. 既存パーサの置き換え

`wikipedia-premiership.ts` の**公開インターフェース（返り値 `ParsedLiveMatch[]`）は変えない**。呼び出し側（`lib/ingestion/live-ingest.ts` 等）に影響を出さないため、内部実装だけを差し替える。

**型が同じでも、フィールドの中身が変わると下流が壊れる。** 2026-08-12 の PR #689 で以下3点の後退が見つかったため、明示的に条件化する（当初の spec に書いていなかった漏れ）。

#### 4-1. `eventId` は既存 DB の形式と一致させる（重複挿入の防止）

`lib/ingestion/upsert.ts` の `findExistingMatch` は、まず `external_ids.wikipedia_event_id` の完全一致で既存行を探す。ここが外れると次に「大会 + 両チーム + キックオフ完全一致」で探し、**それも外れると `upsert.ts:130-132` が `null` を返して新規挿入する**。

| | 値 |
|---|---|
| 既存 DB（`premiership-2026-27` の90件すべて） | `Sale_v_Gloucester` |
| wikitext の `id` パラメータ | `Sale v Gloucester` |

**空白をアンダースコアに正規化して、既存の `wikipedia_event_id` と一致させること。** 正規化しないと、キックオフ時刻が変わった試合が**更新ではなく重複行になる**。シーズン中の時刻変更は日常的に起きるため、これは想定内の経路であり、event_id 突合は本来まさにこのための安全網である。

**`id` パラメータを持たないブロックが93件中3件ある。** その場合の代替キーは、再実行しても同じ値になるものにすること。

#### 4-2. 得点イベントの取り込みを止めないこと

`ParsedLiveMatch.rawHtml` は `live-ingest.ts:338-341` で得点イベントの解析に使われる。

```ts
const rawHtml = eventMatch?.rawHtml ?? match?.rawHtml;
if (!match || !rawHtml) { /* skip */ continue; }
```

**Premiership は `fetchEventMatches` を持たない**（定義があるのは Nations Championship と Lipovitan のみ）ため、**イベントの入手経路は `rawHtml` だけ**である。ここを空文字にすると、**以後 Premiership の全試合が恒久的にイベント0件になる**。

本番実測（2026-08-12）: `premiership-2025-26` の終了済み75試合は**75/75 がイベントを持つ**。稼働中のソースは `premiership-2026-27`（2026年9月開幕）なので、影響は新シーズンの全試合に及び、週次監査の「イベント0件」検知にも毎回かかる。

**イベント取り込みを維持すること。** 実現方法は実装者が選んでよい（例: イベント解析用に従来の HTML を別途取得する / wikitext の `try1` / `con1` / `pen1` から組み立てる）。**後者を選ぶ場合は本 spec のスコープを超えるため、実装前に停止して確認すること。**

**ただし、イベント HTML が取れないことを致命的エラーにしてはならない。** イベントは副次的な情報であり、取れないことを理由に**試合データそのものの取り込みを失敗させない**。`live-ingest.ts` 自身が同じ状況を `no event HTML for finished match ...; will retry on the next ingest.` と記録して継続しており、その設計に合わせる。**警告ログを出して `rawHtml` を空のまま通し、次回以降の取り込みで再試行させること。**

**この点は移行の目的に直結する。** 本移行の狙いは「レンダリング HTML への依存をやめる」ことにある。イベント用に HTML を併用すること自体は許容するが、**HTML パーサが1件取りこぼしただけで全体が停止する構造にすると、移行前より脆くなる**（従来は静かな欠落で済んでいたものが全断になる）。HTML 側は best-effort として扱う。

#### 4-3. `round` / `roundName` を失わないこと

`round` → `external_ids.wikipedia_round`、`roundName` → `external_ids.round_name` に入る。`external_ids` は spread マージなので**既存行の値は消えない**が、**新規挿入される試合はラウンド情報を持たない**。

wikitext には `=== Round 1 ===` 形式の見出しが25個あるので、**`{{rugbybox}}` を走査する際に直前のラウンド見出しを保持すれば復元できる。**

### 5. 0件時の扱い（重要）

**`{{rugbybox}}` が1件も見つからなかった場合は、正常終了せずエラーとして扱う。** 現行パーサが「見つからなければ黙って `continue`」して2シーズン気づかれなかった原因を、ここで塞ぐ。ページ自体が存在しない場合（`isMissingWikipediaPage`）は従来どおり区別する。

## UI サーフェス

なし。

## LLM 連携

なし。

## 受け入れ条件

1. **Premiership 2025-26 の取り込みで93試合が得られる。** 本 spec の作成時に、93件の `{{rugbybox}}` に対し「チーム別名 `home`/`away` → 装飾除去 → リンクの表示テキスト」の規則を適用した机上検証で、**93/93 が既存 `TEAM_SLUG_BY_WIKIPEDIA_NAME` で両チーム解決し、93件すべてにスコアがある**ことを確認済み。**93 に満たない場合は、落ちた件の `{{rugbybox}}` 全体を貼って報告すること。**
2. 得られた試合の**日付・キックオフ時刻・スコア・会場**が、既存の75件と重なる範囲で一致する（既存データを壊していないこと）。
3. **チームのキーが `home`/`away` と `team1`/`team2` のどちらでも解決される。** 片方だけの対応になっていない。
4. **リンクからは表示テキストが採られる**（`[[Saracens F.C.|Saracens]]` → `Saracens`）。リンク先を採っていない。
5. `{{ru|IRE}}` / `{{ru-rt|FRA}}` / `{{Rut|Highlanders}}` のいずれの形式でもチームが解決される。
6. **`{{flagicon|...}}` が併存していてもチームのリンク側が採られる**（URC 形式。国コードを拾っていない）。
7. **`(1 BP)` が接頭辞・接尾辞のどちらに付いていても除去される。**
8. **`date` がリンクの場合も日付が解釈される**（`[[East Midlands Derby (rugby union)|11 October 2025]]` → `11 October 2025`）。
9. **キックオフ時刻が既存の75件と一致する**（`parsePremiershipKickoffAt` を流用し、BST/GMT 判定を作り直していない）。
10. **テンプレート名の大文字小文字を区別していない**（`{{Rugbybox` / `{{rugbybox` の両方を検出する）。
11. スコアの en dash（`–`）が正しく解釈され、未開催試合ではスコアが `null` になる。
12. 対象ページが存在しない場合（404）、既存の `isMissingWikipediaPage` と同じ扱いになる。
13. **`{{rugbybox}}` が0件のときエラーになる**（黙って空配列を返さない）。
14. `wikipedia-premiership.ts` の公開インターフェース（返り値の型）が変わっておらず、呼び出し側の変更が不要。
15. **Premiership 以外の大会の取り込み挙動が一切変わっていない。**
16. 共通ユーティリティが**複数ページの wikitext を結合して扱える**（後続の SRP / Nations Championship を見据えた設計になっている）。
17. **取得が `/wiki/{ページ名}?action=raw` で行われ、`fetchWithPolicy` を経由しており、`skipRobotsCheck` がどこにも使われていない。**
19. **`eventId` が既存 DB の `wikipedia_event_id` と同形式**（`Sale_v_Gloucester`）で、`findExistingMatch` の第1段階で既存行に一致する。`id` を持たない3件の代替キーが再実行で不変である。
20. **得点イベントの取り込みが維持されている。** `rawHtml` を空にしただけで終わらせず、Premiership の終了済み試合でイベントが入ることを確認する。
20-b. **イベント HTML が取れない試合があっても例外を投げず、警告ログを出して継続する。** 試合データの取り込み自体は成功する。
21. **`round` / `roundName` が取れている**（`=== Round N ===` 見出しから復元）。新規挿入される試合も `wikipedia_round` を持つ。
22. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean。

## 未解決の質問

1. **欠落18件の復旧は本 spec の範囲外。** 原因はチーム名改称（D016 参照）で、`premiership-2025-26` を一度だけ取り込み直す必要がある。live ソースの登録は 2026-08-10 に 2026-27 へ切り替わっているため、次回 cron では復旧しない。**別途起票する。**

2. **後続8大会の移行順序。** 件数が一致している大会（Six Nations / Rugby Championship / PNC / Greatest Rivalry）は最後で構わない。**複数ページ結合を要する SRP と Nations Championship を先に回す**ほうが、共通基盤の設計が正しかったかを早く検証できる。

3. **Autumn Nations は移行では直らない。** `lib/ingestion/sources/wikipedia-autumn-nations.ts:38` が生成する `{season}_Autumn_Nations_Series` は 2025 / 2024 / 2023 のいずれも 404 で、**参照先ページ名そのものが誤っている**。DB の32試合がどの経路で入ったのかも未確認。**wikitext 移行とは独立した問題**として別途起票する（D016 未解決の質問(4)）。本 spec では扱わない。
