# 代表戦の取りこぼし点検（30 日以内で DB に無い代表戦を週 1 回通知する）

## 背景

### 流入は「いま行われている代表戦シリーズ」で決まる

GA4（property 538067713、2026-08-26〜09-22、`sessionMedium = organic`、着地ページ別）:

| 着地ページ | ユーザー | セッション |
|---|---:|---:|
| `/c/pnc/2026` | 66 | 70 |
| `/c/greatest-rivalry/2026` | 50 | 56 |
| `/h2h/japan-vs-usa` | 34 | 34 |
| `/c/six-nations/2027` | 23 | 28 |
| `/c/nations-championship/2026` | 19 | 20 |
| `/c/lipovitan-challenge-cup/2026` | 13 | 13 |

Bing の実クエリ（2026-08-25〜09-20、`tools/bing-pull.ts` の summary、クリック計 252）も上位は「パシフィックネーションズカップ2026」「リポビタンdチャレンジカップ2026」「ラグビーズ・グレイティスト・ライバルリー・ツアー」「ネーションズチャンピオンシップ2026」と、**シリーズ名＋年**がほとんど。

**そのシリーズが DB に無ければ、その流入は丸ごと取れない。**

### 取りこぼしは起きている（2026-09-23 確認）

- **南アフリカ × オーストラリア（9/27、Perth）**: DB に無かった。Owner が気づいて手入力した（`australia-south-africa-test-2026`）
- **ブレディスローカップ 2 試合（10/10・10/17）**: DB に無かった。本 spec の調査中に見つけ、`specs/feat-bledisloe-cup-2026-ingestion.md` で対応中

どちらも、取り込み元を個別に作った大会（`lib/ingestion/live-competitions.ts` の `LIVE_COMPETITION_SOURCES`）に属さない単発のテストやシリーズ。**今の仕組みでは、誰かが気づかない限り載らない。** 1 件ずつ spec を書く運用では同じ往復が続く（`feedback_fix_mechanism_not_instance`）。

### 照合元

Wikipedia「2026 men's rugby union internationals」。2026-09-23 に wikitext（`?action=raw`、112,750 バイト）を取得して確認した。

- 月ごとの見出し（`==September==` など）の下に、1 試合 1 個の `{{rugbybox}}`（大文字の `{{Rugbybox}}` も混在。計 49 個）
- チームは `{{ru-rt|AUS}}`・`{{ru|RSA}}` のような **World Rugby の 3 文字コード**。本番 `teams`（`kind = 'national'`、25 チーム）の `short_code` と一致する（AUS・NZL・RSA・JPN・ENG・WAL・SCO など）
- ネーションズチャンピオンシップの試合はこのページに無い（別ページ）。NC は取り込み済みなので問題ない
- ほかに表形式（`{|`）が 89 個あるが、本 spec では扱わない（対象外）

### このページで点検すると、今日は何が出るか（2026-09-23 の wikitext で試算）

30 日以内（9/23〜10/23）の `{{rugbybox}}`:

| 日付 | 対戦 | 判定 |
|---|---|---|
| 9/26 | GIB 対 MLT | 対象外（どちらも DB に無い国） |
| 9/27 | AUS 対 RSA | **DB にある**（手入力済み） |
| 10/10 | NZL 対 AUS | **DB に無い → 通知** |
| 10/10 | ZIM 対 GER | 対象外（GER が DB に無い） |
| 10/17 | AUS 対 NZL | **DB に無い → 通知** |

## スコープ

対象:
- 照合元ページの wikitext から `{{rugbybox}}` を読み、今後 30 日の代表戦を取り出す純粋関数
- DB の試合と照合し、「DB に無い」ものを分類する純粋関数
- それを呼ぶ cron ルートと、Discord（ops）への通知
- 週 1 回の GitHub Actions ワークフロー

対象外:
- **見つけた試合の自動登録。** 通知だけにする。登録は、シリーズなら `LIVE_COMPETITION_SOURCES` への追加（例: `specs/feat-puma-trophy-2026-ingestion.md`）、単発なら手入力。どちらにするかは Owner が決める
- 表形式（`{|`）で書かれた試合、A 代表・XV・クラブとの試合
- 女子・7 人制
- 照合元以外のページ（ツアーの個別ページ等）
- 既存の取り込み処理の変更

## データモデル変更

なし。

## API サーフェス

### 新規: `lib/audit/missing-internationals.ts`（純粋関数のみ。I/O を持たない）

```ts
export type InternationalFixture = {
  date: string;              // "YYYY-MM-DD"（Wikipedia の |date = をそのまま。現地日付）
  homeCode: string | null;   // "NZL" など。読めなければ null
  awayCode: string | null;
  isSeniorSide: boolean;     // 下記ルール
  venue: string | null;      // |stadium = から <ref> とリンク記法を除いたもの
  sourcePage: string;        // ページタイトル
};

export function parseInternationalFixtures(wikitext: string, sourcePage: string): InternationalFixture[];

export type MissingInternationalsResult = {
  missing: InternationalFixture[];     // 両チームが DB の代表で、DB に試合が無い
  present: InternationalFixture[];     // DB に試合がある
  unresolved: InternationalFixture[];  // どちらかのコードが DB の代表に無い
  nonSenior: InternationalFixture[];   // A 代表・XV など
  unparsed: InternationalFixture[];    // 日付かチームが読めない
};

export function classifyInternationalFixtures(args: {
  fixtures: InternationalFixture[];
  nationalTeamIdByCode: Map<string, string>;  // short_code（大文字）→ teams.id
  dbMatches: Array<{ homeTeamId: string; awayTeamId: string; kickoffAt: string }>;
  windowStart: string;  // "YYYY-MM-DD"
  windowEnd: string;    // "YYYY-MM-DD"（両端を含む）
}): MissingInternationalsResult;
```

**解析ルール:**

- テンプレートの取り出しは既存の `parseWikitextTemplates(wikitext, "rugbybox")`（`lib/ingestion/sources/wikipedia-wikitext.ts`）を使う。大文字小文字を区別しない正規表現なので `{{Rugbybox}}` も拾える
- 日付は `date` パラメータ。`<ref>` やコメントを除いてから `d MMMM yyyy` で読む（既存の `parseDmyDate` が使える）
- チームは **`team1`/`team2` と `home`/`away` の両方**を見る（2026-09-23 時点で両方の書き方が混在。例: ZIM 対 GER の箱は `home`/`away`）
- チームの値から最初のテンプレート `{{名前|コード...}}` を取り、コードを大文字化する
- **`isSeniorSide`**: 両チームのテンプレート名が `ru` か `ru-rt`（大文字小文字は区別しない）で、かつ `name=` 引数を持たないとき true。`{{RuA-rt|ENG|name=England A}}` や `{{ru|CHI|name=Chile XV}}` は false
- 時刻（`time`）は読まない。「TBC」の試合がある

**照合ルール:**

- 窓の外（`date < windowStart` または `date > windowEnd`）の試合は結果に含めない
- `unparsed` → `nonSenior` → `unresolved` → `present`/`missing` の順で振り分ける（1 試合は 1 か所だけに入る）
- **`present` の条件**: `dbMatches` に、同じ 2 チーム（**ホームとアウェイが逆でもよい**）で、`kickoffAt` の UTC 日付が Wikipedia の日付の前後 1 日以内のものがある。現地日付と UTC 日付は最大 1 日ずれるため

### 新規: `app/api/cron/audit-missing-internationals/route.ts`

`app/api/cron/audit-prekickoff-readiness/route.ts` と同じ形（`POST`、`assertCronAuthorized`、`apiSuccess`/`apiError`、`PRIVATE_CACHE_CONTROL`）。

1. 窓を決める: `windowStart` ＝ 実行日（UTC 日付）、`windowEnd` ＝ 実行日＋30 日
2. 窓にかかる年ごとに `"{年} men's rugby union internationals"` の wikitext を `fetchWikipediaWikitext([title])` で取る（12 月の実行なら翌年のページも）。**翌年のページが 404 なら、その年は飛ばして続ける**（`isMissingWikipediaPage`）。それ以外の取得エラーは 500 を返す（通知はしない）
3. `teams` から `kind = 'national'` の `id, short_code` を取る
4. `matches` から、窓の前後 2 日を含む範囲で、ホームかアウェイが代表チームの試合を取る。**1,000 行上限に注意**（#853・#858 と同じ型）。窓 30 日の代表戦は数十件なので上限には届かないが、`loadAllPages`（`lib/db/pagination.ts`）で取ること
5. `classifyInternationalFixtures` を呼ぶ
6. `missing` が 1 件以上なら Discord（ops）に通知する（下記）
7. 返り値: `{ window: {start, end}, pages: string[], counts: { missing, present, unresolved, nonSenior, unparsed }, missing: [...] }`

### 通知

`lib/llm/notify.ts` の `notifyPrekickoffReadinessAudit`（`:245-264`）と同じ形で `notifyMissingInternationals(missing, teamNameByCode)` を足し、`postOpsAlert` で送る。

```
🧭 代表戦の取りこぼし点検
30日以内でDBに無い代表戦: 2試合
1. 2026-10-10 ニュージーランド 対 オーストラリア — Eden Park, Auckland
2. 2026-10-17 オーストラリア 対 ニュージーランド — Stadium Australia, Sydney
照合元: 2026 men's rugby union internationals（Wikipedia）
対応: シリーズなら LIVE_COMPETITION_SOURCES に追加、単発なら手入力を検討
```

- チーム名は `teams.name_ja`（無ければ `name`）
- `missing` が 0 件なら通知しない。`unresolved` などの件数は返り値にだけ出し、通知しない（ノイズになるため）

### 新規: `.github/workflows/cron-missing-internationals-audit.yml`

`cron-prekickoff-readiness-audit.yml` と同じ形。

- `schedule: cron: "5 0 * * 1"`（毎週月曜 09:05 JST。GitHub の定期実行は数時間遅れることがある: `project_github_actions_schedule_delay`）
- `workflow_dispatch` あり
- `curl -fsS -X POST`（500 のとき Actions が失敗になる）

## UI サーフェス

なし。

## LLM 連携

なし。LLM を呼ばない。

## 外部取得とコスト

- 取得先は Wikipedia のみ（既存の取り込み元と同じ）。`fetchWithPolicy` が robots.txt を確認する
- 週 1 回・1〜2 リクエスト。DB 読み取りは代表チーム 25 行と 30 日分の代表戦のみ

## 受け入れ条件

### 解析（`tests/lib/audit/missing-internationals.test.ts`）

fixture は**実ページの wikitext をそのまま保存したもの**を使う（`tests/fixtures/wikipedia-2026-mens-rugby-union-internationals.wiki`。`?action=raw` で取得。手作りしない: `feedback_scraper_test_fixture_realism`）。

1. **今日の試算の再現**: fixture を解析し、`windowStart = "2026-09-23"`・`windowEnd = "2026-10-23"`、`dbMatches` に「オーストラリア 対 南アフリカ、`2026-09-27T09:30:00Z`」だけを入れて `classifyInternationalFixtures` を呼ぶと
   - `missing` がちょうど 2 件: `2026-10-10 NZL–AUS` と `2026-10-17 AUS–NZL`
   - `present` に `2026-09-27 AUS–RSA`
   - `unresolved` に `2026-09-26 GIB–MLT` と `2026-10-10 ZIM–GER`（`home`/`away` 表記の箱が読めていること）
   - fixture が更新されて件数が変わる場合は、取得日と件数を fixture の横に書いて期待値を合わせる
2. **表記の揺れ**: `{{Rugbybox}}`（大文字）と `{{rugbybox}}` の両方、`team1`/`team2` と `home`/`away` の両方を読む（小さな単体ケースを追加してよい）
3. **A 代表・XV**: `{{RuA-rt|ENG|name=England A}}` や `{{ru|CHI|name=Chile XV}}` を含む箱は `nonSenior` に入り、`missing` に入らない
4. **ホームとアウェイの逆**: DB が「NZL ホーム」、Wikipedia が「AUS ホーム」でも `present`
5. **日付のずれ**: Wikipedia の日付が `2026-10-10`、DB の `kickoffAt` が `2026-10-09T23:30:00Z`（UTC で前日）でも `present`。`2026-10-12T00:00:00Z`（2 日後）なら `missing`
6. **窓の外**: 窓の外の試合はどの分類にも入らない
7. **読めない箱**: 日付かチームが読めない箱は `unparsed` に入り、例外を投げない

### ルートと通知（`tests/api/audit-missing-internationals.test.ts`。既存の `tests/api/audit-prekickoff-readiness.test.ts` と同じ置き方）

8. 認証が無ければ 401
9. `missing` が 2 件のとき `postOpsAlert` が 1 回呼ばれ、本文に 2 試合の日付と日本語チーム名が入る
10. `missing` が 0 件のとき `postOpsAlert` が呼ばれない
11. 窓が年をまたぐ実行日（例 `2026-12-15`）で、2026 年と 2027 年の 2 ページを取りにいく。**2027 年のページが 404 でも 200 を返し**、2026 年分だけで判定する
12. 404 以外の取得エラーでは 500 を返し、通知しない
13. **壊して落ちる確認**: 条件 4 が「ホームとアウェイの順序まで一致を求める」実装で、条件 5 が「日付の完全一致を求める」実装で落ちることを一時的に壊して確認し、PR 本文に書く（コミットしない）
14. `pnpm lint`・`pnpm typecheck`・`pnpm test` が通り、CI（`gh pr checks`）が緑

### デプロイ後（Claude Code が確認）

15. `workflow_dispatch` で 1 回手動実行し、返り値の `counts` と Discord の通知を確認する。ブレディスローカップの取り込み（`specs/feat-bledisloe-cup-2026-ingestion.md`）が先に本番へ出ていれば `missing` は 0、出ていなければ 2 になる

## 既存テストの巻き添え

- `lib/llm/notify.ts` に関数を足すだけで既存関数は変えない。`tests/llm/notify*.test.ts` があれば既存の assert は触らない

## 競合とマージ順

1. `specs/feat-bledisloe-cup-2026-ingestion.md`（締切 10/8。先に出す）
2. **本 spec**。触るファイルは重ならないので、並行して作業してよい

## 本番操作

なし。

## 運用（Owner の稼働）

- 月曜の通知を見て、載っていない試合があれば「シリーズとして取り込むか／手入力か／見送るか」を決める。**週 5 分程度**を想定（`operating-baseline` の「1 日 10 分・週 5 時間」の範囲内）
- 通知が来ない週は何もしない

## 未解決の質問

なし（2026-09-23 Owner 承認: 集客施策の推奨順 1 として進める）。
