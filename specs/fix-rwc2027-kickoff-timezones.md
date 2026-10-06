# RWC 2027 のキックオフ時刻を会場の時間帯で正しく取り込む

## 背景

2026-10-06、GPT にサイトの評価を頼んだところ（`docs/notes/gpt-growth-audit-2026-10-06/prompt.md`）、「RWC 2027 の日本戦の時刻が JRFU と違う」と指摘された。Claude Code が DB と World Rugby の公式日程（下の「正しい日程」）を照合して確認した。

- `rwc-2027` の 36 試合（プール戦）のうち **21 試合のキックオフ時刻が誤っている**。正しいのは 15 試合。
  - 日本戦: フランス戦を 10/9 16:45 JST と表示（正しくは **17:45**）、米国戦を 10/16 05:00 JST と表示（正しくは **10/15 18:30**）。サモア戦（10/3 10:15）は正しい。
  - 現地時間に直すと、アデレード 06:30、パース 03:15 など、ありえない時刻が入っている。
- 36 試合とも `updated_at` が 2026-05-20 のままで、それ以降一度も取り込み直していない。

原因（Claude Code がコードを読んで確認）:
1. **時刻の読み取り**: RWC の取り込み（`lib/ingestion/fixtures.ts` の `ingestRwc2027Fixtures`）は、シックスネーションズ用の読み取り処理 `parseWikipediaSixNationsHtml`（`lib/ingestion/sources/wikipedia-six-nations.ts`）をそのまま使っている。この処理は Wikipedia の時刻の後ろにある時間帯の略称（`AEST` など）を `TIMEZONE_OFFSETS` で時差に直すが、
   - **`ACDT`（アデレード、+10:30）・`ACST`（+9:30）・`AWST`（パース、+8）が表に無く、知らない略称は時差 0（UTC）として扱う**（`TIMEZONE_OFFSETS[...] ?? 0`）。アデレードの 20:00 が 20:00 UTC になる。
   - 時差は整数の時間しか扱えない（30 分の時差を表せない）。
   - 略称は Wikipedia の編集者が書いたもので、会場の実際の時間帯と食い違うことがある（5/20 の時点ではブリスベンの試合が `AEDT` 扱いになっていたと見られる。ブリスベンは夏時間が無い）。
2. **取り込み直していない**: 毎週の `cron-ingest-fixtures.yml` は本文なしで `POST /api/cron/ingest-fixtures` を呼ぶため、既定値の `six-nations-2027` だけを取り込む。`rwc-2027` は 5/20 に手動で 1 回取り込んだきり。

## スコープ

対象:
1. RWC 2027 の取り込みで、キックオフ時刻を**会場の都市の時間帯（IANA の時間帯名）**から計算する。
2. 共通の読み取り処理で、知らない時間帯の略称を UTC として扱わない。
3. 毎週の取り込みに `rwc-2027` を加える。
4. 本番の 36 試合を取り込み直す（実行範囲は下に分けて書く）。

対象外: 決勝トーナメント（16 試合、対戦相手未定で未登録）、RWC のページの表示、シックスネーションズ 2027 の時刻の見直し（会場がヨーロッパで、今の略称の表で足りている）、他の大会。

## データモデル変更

なし。

## 正しい日程（2026-10-06、Claude Code が World Rugby の公式 PDF から書き写したもの）

出典: World Rugby「RWC 2027 Match Schedule」（`https://resources.worldrugby-rims.pulselive.com/worldrugby/document/2026/02/02/d096842d-5029-42fc-9720-3eaa66d27134/RWC-2027_Match-Schedule_All.pdf`）。PDF の注記「ALL KICK-OFF TIMES ARE IN LOCAL TIME. SUBJECT TO CHANGE.」。UTC と日本時間は Claude Code が Python の `zoneinfo` で換算した。

2027 年の豪州の夏時間は **10/3（日）2:00 開始**。シドニー・メルボルン・ニューカッスルの 10/1〜10/2 は AEST（+10）、10/3 以降は AEDT（+11）。アデレードは 10/2 まで ACST（+9:30）、10/3 以降 ACDT（+10:30）。ブリスベン・タウンズビルは夏時間なしで常に +10、パースは常に +8。

| # | 試合 | 会場の都市 | 現地 | UTC | 日本時間 |
|---|---|---|---|---|---|
| 1 | AUS v HKG | Perth | 10/1 18:45 | 10-01 10:45 | 10/01 19:45 |
| 2 | WAL v ZIM | Adelaide | 10/2 12:15 | 10-02 02:45 | 10/02 11:45 |
| 3 | ENG v TGA | Brisbane | 10/2 20:15 | 10-02 10:15 | 10/02 19:15 |
| 4 | FRA v USA | Melbourne | 10/2 17:45 | 10-02 07:45 | 10/02 16:45 |
| 5 | NZL v CHI | Perth | 10/2 13:15 | 10-02 05:15 | 10/02 14:15 |
| 6 | RSA v ITA | Adelaide | 10/3 14:15 | 10-03 03:45 | 10/03 12:45 |
| 7 | SCO v URU | Melbourne | 10/3 17:15 | 10-03 06:15 | 10/03 15:15 |
| 8 | JPN v SAM | Newcastle | 10/3 12:15 | 10-03 01:15 | 10/03 10:15 |
| 9 | GEO v ROU | Townsville | 10/3 20:15 | 10-03 10:15 | 10/03 19:15 |
| 10 | ARG v CAN | Brisbane | 10/4 18:45 | 10-04 08:45 | 10/04 17:45 |
| 11 | FIJ v ESP | Newcastle | 10/4 14:15 | 10-04 03:15 | 10/04 12:15 |
| 12 | IRE v POR | Sydney | 10/4 17:15 | 10-04 06:15 | 10/04 15:15 |
| 13 | ENG v ZIM | Adelaide | 10/8 20:15 | 10-08 09:45 | 10/08 18:45 |
| 14 | WAL v TGA | Melbourne | 10/8 18:15 | 10-08 07:15 | 10/08 16:15 |
| 15 | FRA v JPN | Brisbane | 10/9 18:45 | 10-09 08:45 | 10/09 17:45 |
| 16 | USA v SAM | Perth | 10/9 12:15 | 10-09 04:15 | 10/09 13:15 |
| 17 | NZL v AUS | Sydney | 10/9 17:10 | 10-09 06:10 | 10/09 15:10 |
| 18 | CHI v HKG | Townsville | 10/9 20:15 | 10-09 10:15 | 10/09 19:15 |
| 19 | FIJ v CAN | Adelaide | 10/10 12:15 | 10-10 01:45 | 10/10 10:45 |
| 20 | RSA v GEO | Brisbane | 10/10 16:45 | 10-10 06:45 | 10/10 15:45 |
| 21 | ARG v ESP | Melbourne | 10/10 15:15 | 10-10 04:15 | 10/10 13:15 |
| 22 | IRE v SCO | Perth | 10/10 17:45 | 10-10 09:45 | 10/10 18:45 |
| 23 | URU v POR | Newcastle | 10/11 17:15 | 10-11 06:15 | 10/11 15:15 |
| 24 | ITA v ROU | Sydney | 10/11 19:45 | 10-11 08:45 | 10/11 17:45 |
| 25 | JPN v USA | Adelaide | 10/15 20:00 | 10-15 09:30 | 10/15 18:30 |
| 26 | NZL v HKG | Melbourne | 10/15 17:15 | 10-15 06:15 | 10/15 15:15 |
| 27 | TGA v ZIM | Townsville | 10/15 20:15 | 10-15 10:15 | 10/15 19:15 |
| 28 | ARG v FIJ | Adelaide | 10/16 13:15 | 10-16 02:45 | 10/16 11:45 |
| 29 | AUS v CHI | Brisbane | 10/16 15:10 | 10-16 05:10 | 10/16 14:10 |
| 30 | ENG v WAL | Sydney | 10/16 19:45 | 10-16 08:45 | 10/16 17:45 |
| 31 | ESP v CAN | Townsville | 10/16 20:15 | 10-16 10:15 | 10/16 19:15 |
| 32 | SCO v POR | Brisbane | 10/17 16:15 | 10-17 06:15 | 10/17 15:15 |
| 33 | IRE v URU | Melbourne | 10/17 14:45 | 10-17 03:45 | 10/17 12:45 |
| 34 | ITA v GEO | Newcastle | 10/17 12:15 | 10-17 01:15 | 10/17 10:15 |
| 35 | RSA v ROU | Perth | 10/17 19:15 | 10-17 11:15 | 10/17 20:15 |
| 36 | FRA v SAM | Sydney | 10/17 19:45 | 10-17 08:45 | 10/17 17:45 |

（DB の略称との対応: TGA＝`TON`、IRE＝`IRL`。Sydney は Stadium Australia と Sydney Football Stadium の 2 会場。）

## 変更内容

### 1. 会場の都市から時間帯を決める（RWC 2027 の取り込み）

- `lib/ingestion/sources/wikipedia-rwc.ts` に、会場の都市 → IANA の時間帯名の表を足す: Sydney / Newcastle → `Australia/Sydney`、Melbourne → `Australia/Melbourne`、Brisbane / Townsville → `Australia/Brisbane`、Adelaide → `Australia/Adelaide`、Perth → `Australia/Perth`。都市は読み取った `venue` の文字列（例 `Adelaide Oval, Adelaide`）から判定する。
- 現地の日付と時刻（壁時計の時刻）と時間帯名から UTC を計算する関数を作る（`Intl.DateTimeFormat` で時差を求める方法でよい。新しい依存パッケージは足さない）。**夏時間の切り替えをまたぐ日付（10/2 と 10/3）でも正しいこと**。
- RWC 2027 の取り込みでは、Wikipedia の略称より会場の時間帯を優先する。会場の都市が表に無い試合は、その試合を書き込まずに、結果の `counts` に `skipped_unknown_venue` として数え、`console.warn` に試合と会場を出す。

### 2. 共通の読み取り処理で、知らない略称を UTC にしない（`wikipedia-six-nations.ts`）

- `TIMEZONE_OFFSETS` に `ACST`（9.5）・`ACDT`（10.5）・`AWST`（8）を足し、30 分単位の時差を扱えるようにする。
- 略称が表に無いときに 0 を使う `?? 0` をやめる。**知らない略称の試合は `kickoffAt` を `null` にする**（既存の `upsertMatches` は `kickoffAt` が無い候補を書き込まずに飛ばす。`lib/ingestion/upsert.ts` の `skipped match without kickoff_at`）。時刻の無い日付だけの書き方（今の `timezoneText: "UTC"` の扱い）は変えない。
- この関数はシックスネーションズ・ネーションズチャンピオンシップなど他の取り込みでも使われている。着手前に `rg -n "parseWikipediaSixNationsHtml|parseWikipediaSixNations2027Html" lib app` で使っている場所を全部挙げ、PR 本文に貼る。

### 3. 毎週の取り込みに RWC 2027 を加える（`.github/workflows/cron-ingest-fixtures.yml`）

- 今の呼び出し（本文なし＝シックスネーションズ 2027）はそのまま残し、2 つ目の手順として `{"competition":"rwc-2027"}` を本文に付けた呼び出しを足す。1 つ目が失敗しても 2 つ目は実行する（`if: always()` など）。どちらかが失敗したらジョブは失敗にする。
- 理由: 公式日程は「変更の可能性あり」と明記されている。週 1 回取り込み直せば、変更が反映される。

## API サーフェス

なし（`POST /api/cron/ingest-fixtures` の本文の形は今のまま）。

## UI サーフェス

なし。

## LLM 連携

なし。

## 受け入れ条件

1. **36 試合の時刻のテスト**: 上の「正しい日程」の 36 行を fixture にする（現地の日付・時刻・会場の都市 → 期待する UTC）。会場の時間帯から計算した UTC が 36 件すべて一致する。特に 4（メルボルン 10/2、夏時間の前日）、2（アデレード 10/2、+9:30）、6（アデレード 10/3、+10:30）、25（日本 対 米国）、15（フランス 対 日本）、1（パース）を名前付きのテストにする。
2. **読み取りのテスト**: Wikipedia の RWC 2027 のプールのページの書き方（`9 October 2027 18:45 AEST` と会場 `Brisbane Stadium, Brisbane`）の HTML 断片から、`2027-10-09T08:45:00.000Z` が得られる。略称がページ上で間違っていても（例: ブリスベンの試合に `AEDT` と書かれていても）、会場の時間帯が優先されて同じ値になる。
3. **知らない略称のテスト**: 共通の読み取り処理で、`15 October 2027 20:00 XYZT` は `kickoffAt: null` になる。`ACDT` は +10:30、`AWST` は +8 で計算される。シックスネーションズの既存のテストはそのまま通る。
4. **会場が表に無いテスト**: RWC 2027 の取り込みで会場の都市が表に無い試合は書き込まれず、`skipped_unknown_venue` が 1 になる。
5. **重複しないことのテスト**: 既に同じ `wikipedia_event_id` の試合があるとき、時刻だけが変わった候補は既存の行の更新になり、新しい行は増えない（`lib/ingestion/upsert.ts` の `findExistingMatch` は `wikipedia_event_id` で既存の行を探す。この挙動を前提にしていることをテストで固定する）。
6. **「壊して落ちる」確認**（コミットしない）: 会場の時間帯を使わず略称だけで計算するように戻すと 1 と 2 のテストが落ちる。`?? 0` に戻すと 3 のテストが落ちる。出力を PR 本文に貼る。
7. `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` がすべて通る（CI の `validate`）。

## 実行範囲（本番操作）

コードの PR とは分ける。マージ・デプロイ後に次を行う。

1. Owner の承認を得て、Claude Code が GitHub Actions の `Cron — Ingest Fixtures` を手動実行する（`gh workflow run cron-ingest-fixtures.yml`）。これで 2 つ目の手順が `rwc-2027` を取り込み直す。
2. 結果を確認する: ジョブのログの `matches_inserted` が **0**（新しい行が増えていない）、`matches_updated` が 36 前後。**`matches_inserted` が 1 以上なら、重複した行ができているので、Owner に報告して止まる**（削除は Claude Code では行わない）。
3. Claude Code が DB の 36 試合を上の「正しい日程」の UTC と照合し、不一致 0 件を確かめる。本番の日本戦のページで、フランス戦が 10/9 17:45、米国戦が 10/15 18:30 と表示されることを確かめる。

## 未解決の質問

- なし。

## 2026-10-06 追記: 取り込み直しが「Hong Kong」で止まった

PR #924 のマージ後、Owner の承認を得て Claude Code が `Cron — Ingest Fixtures` を手動実行した（run 37414586377）。シックスネーションズ 2027 は成功（inserted 0・updated 15）、RWC 2027 は **500** で失敗した。Vercel のログ: `Unknown RWC 2027 team name: Hong Kong`。

- Wikipedia のプール A のページが、香港を「Hong Kong China」ではなく「**Hong Kong**」と書くようになった。`RWC_2027_TEAM_SLUG_BY_WIKIPEDIA_NAME`（`lib/ingestion/sources/wikipedia-rwc.ts`）には「Hong Kong China」しか無い。
- 書き込みの前に止まったので、DB は変わっていない（36 試合とも `updated_at` は 2026-05-20 のまま、Claude Code 確認）。

追加の修正:
1. 表に `"Hong Kong": "hong-kong-china"` を足す（「Hong Kong China」も残す）。
2. 今の 6 つのプールのページ（`RWC_2027_POOL_PAGE_URLS`）に出てくるチーム名 24 個を取得して、表にすべてあることを確かめ、PR 本文に一覧を貼る。足りない名前があれば同じく足す。
3. テスト: `resolveRwc2027TeamSlug("Hong Kong")` が `"hong-kong-china"` を返す。

マージ後、Claude Code が再び手動実行し、上の「実行範囲」の 2・3 を確かめる。
