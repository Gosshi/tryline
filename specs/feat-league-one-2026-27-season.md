# リーグワン 2026-27 を開幕に間に合わせる

決定: `docs/decisions.md` D038（2026-11-14）。

## 背景

リーグワン 2026-27 は **2026-12-12（土）に開幕する**（league-one.jp の日程ページで確認、2026-11-14）。Bing では「リーグワン ラグビー 日程」が表示89回・クリック0回で、日本語の需要はあるのに取れていない（D038）。

ところが今の取り込みは 2025-26 のままで、**このままでは開幕しても1試合も入らない。** 2026-11-14 に 2026-27 の日程ページを既存のパーサに通すと、次の2つで失敗した。

| 問題 | 実測（2026-11-14、`https://league-one.jp/en/schedule/?t1=3&year=2026`） | 今のコードの挙動 |
|---|---|---|
| 1. 時刻未定の試合 | DIVISION 1 の108試合中 **55試合** の時刻が `Undecided`（例 `20.02 Sat` / `Undecided`）。うち **7試合は日付も空**（試合ID 31194・31217・31218・31223・31224・31229・31230。2026-11-14 に Codex が取得した fixture で確認） | `parseKickoffAt` が例外を投げ、**リーグワン全体の取り込みが失敗する** |
| 2. チーム名の変更 | 12チーム中2チームが既存の対応表に無い: `TOCHIGI Honda HEAT`（日本語ページでは 栃木ホンダヒート）、`TOSHIBA BRAVE LUPUS MUSASHI`（東芝ブレイブルーパス武蔵） | `resolveTeamSlug` が `null` を返し、その試合を**黙って捨てる**（ログも出ない） |

他の10チームは既存の対応表で解決できる（2026-11-14 に確認）。

英語版の仕組み（`lib/cron/orchestrate.ts` の `generateLeagueOneEnglishContent`、`/matches/[id]/en`、サイトマップの英語ページ）は大会の family で判定しているので、2026-27 の試合が入れば**そのまま動く。** 英語版の新規開発はしない。

## スコープ

対象:
1. 取り込み元を 2026-27 に切り替える（シーズンを引数で受ける関数にする）
2. 時刻未定の試合を「日付だけ確定」として取り込む
3. 改称した2チームを既存のチームに対応させる（チームページ・H2H の履歴を続けるため、slug は変えない）
4. 対応表に無いチーム名が出たら、黙って捨てずにログに出す
5. 改称した2チームの表示名をマイグレーションで更新する

対象外:
- DIVISION 2・3（今と同じく取り込まない）
- プレーオフ用の cron（`.github/workflows/cron-fill-league-one-playoff-events.yml` は `{"season":"2025-26"}` 固定。プレーオフは 2027-05 なので別 spec。未解決の質問3）
- 英語版の追加開発、`/en` トップの改修
- 大会ハブの見た目・文言の変更
- 時刻未定の試合の通知（未解決の質問2）

## データモデル変更

テーブル定義の変更なし。**データ更新のマイグレーションを1本**（`supabase/migrations/<timestamp>_rename_league_one_teams_2026_27.sql`）:

| slug | `name` / `name_ja` | `english_name` |
|---|---|---|
| `honda-heat` | 三重ホンダヒート → **栃木ホンダヒート** | Mie Honda Heat → **Tochigi Honda Heat** |
| `toshiba-brave-lupus` | 東芝ブレイブルーパス東京 → **東芝ブレイブルーパス武蔵** | Toshiba Brave Lupus Tokyo → **Toshiba Brave Lupus Musashi** |

- `WHERE slug = ...` で更新する（名前で探さない）
- `slug`・`short_code` は変えない
- 過去の試合（2025-26 以前）のページも新しい名前で表示される。チームの現在名を出す既存の扱いと同じ
- **適用はマージ前に本番で行う**（Owner が実行。表示コードの変更は無いが、取り込み後すぐに新しい名前で記事が生成されるため）

`competitions` の `league-one-2026-27` 行は、取り込み時の `upsertCompetition`（`lib/ingestion/live-ingest.ts`）が作る。マイグレーションは要らない。

## 実装

### 1. シーズンを引数で受ける

`lib/ingestion/sources/league-one-live.ts`:
- `fetchLeagueOneSeason(season: string): Promise<ParsedLiveMatch[]>` を足す。中身は今の `fetchLeagueOne202526` と同じ（通常日程 `t1=3` とプレーオフ `t1=0` の2ページを取得して結合・並べ替え）
- `fetchLeagueOne202526` は `fetchLeagueOneSeason("2025-26")` を呼ぶだけにする（既存のスクリプト・テストが使っている）
- プレーオフページにまだ試合が無い（0件）ときは空配列として扱い、エラーにしない

`lib/ingestion/live-competitions.ts`:
- `league-one-2025-26` の要素を、次の要素に**置き換える**:

```ts
{
  competitionName: "League One 2026-27",
  competitionSlug: "league-one-2026-27",
  family: "league-one",
  fetch: () => fetchLeagueOneSeason("2026-27"),
  season: "2026-27",
  sourceLabel: "league-one.jp",
}
```

2025-26 は 2026-06-07 に終わっているので、取り込みを続ける必要はない。

### 2. 時刻未定の試合

`parseKickoffAt` を、時刻が `HH:MM` でないとき（`Undecided`・空文字・`TBC` 等）に例外を投げず、次を返すように変える:
- `kickoffAt`: その日付の **12:00 JST**（UTC 03:00）
- `kickoffTimeTbd: true`

時刻があるときは今と同じ値で `kickoffTimeTbd: false`。

**日付が読めないカード（日付欄が空、または `D.M` 形式でない）は、例外を投げずにその試合だけを除く。**
- 除いたカードは、試合ID（`/en/match/<id>` の数字。無ければ対戦カード名）を添えて `console.warn("[league-one-live] skipped cards without date", { matchIds, season })` で1回だけ出す
- 理由: 1枚のカードの欠落で例外を投げると、時刻未定のときと同じく**リーグワン全体の取り込みが止まる**。日付が発表されれば、次の取り込みで同じ `eventId`（`match_<id>`）として入る
- 2026-11-14 時点では7試合が該当し、返るのは101試合

（2026-11-14 改訂: 当初は「日付が読めないときは例外」としていたが、実データに日付未定のカードがあり、受け入れ条件1・5と両立しなかった。Codex の停止報告による。）

`parseLeagueOneLiveHtml` は `kickoffTimeTbd` を `ParsedLiveMatch` に入れる（`ParsedWikipediaMatch` に既にある項目。URC・プレミアシップの取り込みと同じ使い方）。後で時刻が発表されると、同じ `eventId`（`match_<id>`）の行が更新され、`kickoff_time_tbd` は `false` になる（`lib/ingestion/upsert.ts` の既存の処理）。

### 3. 改称した2チーム

`lib/scrapers/league-one-schedule.ts` の `TEAM_SLUG_BY_LEAGUE_ONE_NAME` に足す:

```ts
"Tochigi Honda Heat": "honda-heat",
"Toshiba Brave Lupus Musashi": "toshiba-brave-lupus",
```

照合は既存の `normalizeTeamName`（小文字化）を通るので、ページ上の大文字表記（`TOCHIGI Honda HEAT` 等）でも一致する。既存の項目は消さない（過去シーズンの再取り込みで使う）。

### 4. 対応表に無いチーム名

`parseLeagueOneLiveHtml` で、DIVISION 1 またはプレーオフのカードのうちチーム名が解決できなかったものを集める。
- 今と同じく、その試合は返さない
- 解決できなかった名前（重複なし）を `console.error("[league-one-live] unresolved team names", { names, season })` で出す
- 関数の戻り値の型は変えない（呼び出し元への影響を避ける）。名前の一覧を返す関数を別に export する（例 `findUnresolvedLeagueOneTeamNames(html)`）か、`parseLeagueOneLiveHtml` の中でログを出すかは Codex が選んでよい。どちらにしたかを PR 本文に書く

## API サーフェス

変更なし。

## UI サーフェス

コード上の変更なし。2026-27 の試合が入ると、既存の `/c/league-one`・`/c/league-one/2026-27`・カレンダー・トップに出る。

## LLM 連携

新しいプロンプト・モデルの変更なし。2026-27 の試合に対して、既存の preview/recap（日本語と英語）が D030 の時刻（前日15:00 JST）に生成される。

**費用の増加:** レギュラーシーズン108試合 × preview/recap × 日本語/英語。2025-26（136試合・公開133本）と同じ規模で、新しい種類の費用ではない。Top 14 の撤退（`specs/retire-top14.md`、直近60日で84本）で減る分とほぼ相殺する。1本あたりの費用は未集計。

## 受け入れ条件

fixture: 2026-11-14 に取得した 2026-27 の日程ページから、次を含む部分を `tests/fixtures/league-one-schedule-2026-27.html` として保存する（Codex が `fetchWithPolicy` 経由で1回取得して切り出す。ページ全体でもよい）:
- 時刻ありのカード（例 `12.12 Sat 12:00`）
- 時刻が `Undecided` のカード
- `TOCHIGI Honda HEAT` と `TOSHIBA BRAVE LUPUS MUSASHI` が出るカード
- DIVISION 2 のカード

1. fixture を `parseLeagueOneLiveHtml(html, "2026-27")` に通すと**例外を投げない**（日付も時刻も未定のカードを含む）
2. 時刻ありのカードは `kickoffAt` が JST の時刻どおり（`12.12 Sat 12:00` → `2026-12-12T03:00:00.000Z`）、`kickoffTimeTbd === false`
3. `Undecided` のカードは `kickoffAt` がその日付の 12:00 JST（`20.02` → `2027-02-20T03:00:00.000Z`）、`kickoffTimeTbd === true`。年は 2027（1〜6月は終了年）
4. `TOCHIGI Honda HEAT` の試合は `honda-heat`、`TOSHIBA BRAVE LUPUS MUSASHI` の試合は `toshiba-brave-lupus` に解決される
5. 返った試合数 = fixture の DIVISION 1 のカード数 − 日付が空のカード数（2026-11-14 取得のページ全体で 108 − 7 = **101**）。期待値はテスト内で fixture から数えて求めず、`101` と固定値で書く（fixture を取り直したら更新する）。「解決できなかった名前」は0件
6. DIVISION 2 のカードは返らない（今と同じ）
7. 対応表に無いチーム名（fixture のチーム名を1つ書き換えたもの）を渡すと、その試合は返らず、`console.error` が名前つきで1回呼ばれる（`vi.spyOn`）
8. 日付が空のカードは返らず、`console.warn` がその試合ID（2026-11-14 の fixture では上の7件）つきで**1回だけ**呼ばれる。同じ fixture で、日付のある他のカードはすべて返る（`vi.spyOn`）
9. `LIVE_COMPETITION_SOURCES` に `league-one-2026-27` があり、`league-one-2025-26` が無い（テスト）
10. `fetchLeagueOneSeason("2026-27")` が `t1=3&year=2026` と `t1=0&year=2026` の2つの URL を取得する。プレーオフページが0件でも例外を投げない（`fetchWithPolicy` をモック）
11. 既存のテスト（`tests/ingestion/live-sources.test.ts`・`tests/scrapers/league-one-*.test.ts` 等）が通る。**2025-26 の既存 fixture の期待値は変えない**（時刻ありの試合の扱いは変わらない）
12. マイグレーションのテスト（既存の `tests/db-migrations-*.test.ts` の形式）で、2チームの `name`・`name_ja`・`english_name` が上の表のとおりに更新され、`slug` で絞っていることを確認する
13. **壊して確かめる:** (a) 2節の変更を戻す（時刻未定で例外を投げる）と、受け入れ条件1・3が落ちる。(c) 日付が空のカードで例外を投げるように変えると、受け入れ条件1・8が落ちる。(b) 3節で足した2行を消すと、4・5が落ちる。3つの出力を PR 本文に貼る（変更は戻す）
14. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` が通る

**マージ後の確認（Claude が行う）:**
- マイグレーションが本番に適用済みであること（マージ前。Owner に確認）
- 次の取り込み cron の後、本番 DB で `league-one-2026-27` の試合数が「取得時点の DIVISION 1 のカード数 − 日付が空のカード数」と一致（11/14 時点なら101）、`kickoff_time_tbd = true` の件数が取得時点の「日付はあるが時刻未定」の数と一致（11/14 時点なら48）、チームが2つ以上の slug に分かれていない（SELECT で確認）
- `/c/league-one` が 2026-27 を表示し、生 HTML（`curl`）に 2026-12-12 の試合へのリンクがある
- 2026-12-11 の 15:00 JST 以降に、12/12 の試合の日本語・英語プレビューが生成されている

## 期限

**2026-12-09（水）までにマージと取り込みを終える。** 開幕節のプレビューは 12/11 の 15:00 JST の cron で作られる（D030。実際の発火は数時間遅れることがある）。取り込みは cron で6時間ごとなので、マージが 12/10 だと間に合わない可能性がある。

## 未解決の質問

1. **チーム名の短縮表記**: `short_code`（`MHH`・`TBL`）を変えるか。今回は変えない。表示に使っている箇所で違和感があれば Owner が判断する
2. **時刻未定の試合の通知・プレビュー**: `kickoff_time_tbd = true` のまま前日になった試合は、仮の 12:00 JST で通知・プレビューの時刻が決まる。2026-27 では未定は2月以降の試合で、それまでに発表される見込みだが確認していない。URC でも同じ問題がある（2026-09 のメモ）。1月に未定のまま残っている試合があれば、通知側で `kickoff_time_tbd` を見る spec を別に作る
3. **プレーオフの cron**: `cron-fill-league-one-playoff-events.yml` の `"2025-26"` 固定。2027-04 までに別 spec で直す

## 競合とマージ順

- `specs/retire-top14.md` と同じ `lib/ingestion/live-competitions.ts` を触る。**期限があるのでこちらを優先する。** 後から出す PR が最新の main に合わせる
- マイグレーションはマージ前に本番適用する（新しいデータを前提にしたコードを先に出さない運用）
