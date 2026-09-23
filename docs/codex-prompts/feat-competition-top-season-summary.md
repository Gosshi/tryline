# Codex 指示書: 大会トップ `/c/<大会>` に現在シーズンの要点を出す

仕様書: `specs/feat-competition-top-season-summary.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コード・実データが食い違ったら、実装を進めずその場で止めて Owner に確認する。

> **2026-09-23 追記（実装途中の変更）**: 期間の定数に `nations-championship-2026`（2026-07-04〜2026-11-29）を追加した。日付は主催者発表どおりで日本時間に換算しない。`tests/lib/format/competition-period.test.ts` にこの slug の既知ケースを足すこと。

## 直したいこと

大会トップ（例 `/c/rwc`・`/c/pnc`）の title は「順位表・日程・日本での視聴方法」なのに、本文には大会の歴史紹介と「試合一覧を見る →」しかない。
検索者が知りたい「いつ・次の試合は日本時間で何時・日本代表は出るか・順位・どこで見られるか」を、**シーズンページが既に使っている関数とデータで**大会トップにも出す。

## 触るファイル

新規:
- `lib/format/season-summary.ts` — シーズンページから移す純粋関数 + `getLeaderLabel` + `getSeasonPeriodLabel`
- `lib/format/competition-period.ts` — `getKnownCompetitionPeriod`（RWC 2027 と Nations Championship 2026 の 2 件。値は仕様書の表）
- `components/japan-matches-block.tsx` — ブロック C（日本代表の試合）。**後でシーズンページにも置くので、大会トップ固有の値を中に持たせず props だけで描画する**
- `tests/lib/format/season-summary.test.ts`、`tests/lib/format/competition-period.test.ts`（既存の `tests/lib/format/` の置き方に合わせる。無ければ近い既存テストの場所に合わせる）

変更:
- `app/c/[competition]/page.tsx` — 要点セクション追加、旧「最新シーズン」カード削除、並び替え、`revalidate` と `generateStaticParams`
- `app/c/[competition]/[season]/page.tsx` — 移した関数を import に置き換えるだけ。**表示は 1 文字も変えない**
- `tests/app/competition-hub-indexing.test.tsx` — モック追加・`:83` の書き換え・受け入れ条件 1〜10 のテスト追加

触らない:
- `generateMetadata`（大会トップ・シーズンページとも）。title / description / OG / canonical は変えない
- `app/c/rwc/2027/page.tsx`、`app/c/lipovitan-challenge-cup-2026/page.tsx`
- `lib/db/queries/*`（既存関数を呼ぶだけ。`listSeasonsByFamily` の 1000 行上限問題は別件なので直さない）
- `lib/ingestion/live-ingest.ts`
- `tests/app/season-page-ia.test.tsx` と `tests/app/competition-guide-metadata.test.ts` の **assert**（受け入れ条件 12）。後者のモック不足で落ちたときにモックを足すのは可

## 具体例（2026-09-23 本番データ）

| URL | 選ばれるシーズン | 期待される要点 |
|---|---|---|
| `/c/rwc` | 2027（36 試合すべて予定、日本代表 3 試合、`start_date`/`end_date` は null） | 「開幕前」「2027年10月1日〜2027年11月13日」、次の試合 3 件（最初は 2027-10-01T18:45Z＝日本時間 10/2 03:45）、日本代表の 3 試合、視聴方法 |
| `/c/pnc` | 2026（4 試合すべて終了、日本代表 2 試合） | 「終了」「2026年9月12日〜2026年9月19日」、日本代表の 2 試合とスコア（例: 日本 63–14 アメリカ）、順位（あれば）、視聴方法 |
| `/c/premiership` | 2026-27（90 試合すべて予定） | 「開幕前」、**期間は出さない**（DB の 2026-09-25〜2027-06-03 を使わない）、次の試合 3 件、視聴方法 |
| `/c/super-rugby-pacific` | 2026（83 試合すべて終了） | 「終了」、期間、最終順位（上位 3）と優勝、視聴方法 |

## 処理すべきエッジケース

1. **開催期間に `competitions.start_date / end_date` を使わない**。Top 14 2026-27 は DB で 9/26〜9/27 だが既に 21 試合終わっている（取り込みが毎回上書きしている）。期間は「定数」か「post のときの試合の日本時間日付」だけ
2. **`totalRounds` が null の大会は `hasIncompleteSchedule` が「欠けなし」と言う**。RWC 2027 はプール戦 36/52 しか入っていないので、試合から期間を出すと 11/13 の決勝が消える。だから RWC は定数が必要
3. 日本時間の日付は **UTC の日付と 1 日ずれうる**（`project_narrative_date_utc_leak` の前例）。`kickoffAt.slice(0, 10)` で日付を取らない
4. 日本代表が出ない大会で「日本代表は出場しません」等を**書かない**。取り込みが欠けている可能性があるので、無いことは断言できない。ブロックごと出さない
5. 開幕前は順位表を出さない（ゼロ値の表になる）。`isSeasonNotStarted` を使う
6. `listMatchesForCompetition` が `[]` のシーズン（例: 開催なし）でも例外を投げない。ブロック A だけ出す
7. `cancelled` の試合は次の試合・日本代表の試合・期間のいずれにも使わない
8. スコアは `homeScore` / `awayScore` のどちらかが null なら出さない

## 既存テストの巻き添え（必ず直す）

- `tests/app/competition-hub-indexing.test.tsx:36-43`: `@/lib/db/queries/competitions` と `@/lib/db/queries/matches` のモックが関数を絞っているので、新たに呼ぶ `listMatchesForCompetition`・`listFamilies`・`selectLatestSeasonWithMatches` が未定義になる。`@/lib/db/queries/standings`・`@/lib/db/queries/match-broadcasts` のモックも足す
  - `selectLatestSeasonWithMatches` は**本物を使う**（`vi.importActual`）。モックで返り値を固定しない
- 同ファイル `:83` の「最新シーズン」リンクの assert は、仕様書の受け入れ条件 8 に書き換える

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test`
- 受け入れ条件 14: 期間のテストが「DB の日付や試合の日付範囲にフォールバックする実装」で落ちること、日付テストが「日本時間変換を外した実装」で落ちることを**一時的に壊して確認**し、PR 本文に書く（壊した変更はコミットしない）
- 受け入れ条件 15: 1440px と 375px のスクリーンショット 8 枚（4 ページ × 2 幅）を PR に貼る。1440px で要点セクションが 2 列になっていること
- 受け入れ条件 11 の `x-vercel-cache: HIT` 確認はデプロイ後。プレビュー URL で確認できるならそこで、できなければ PR に「未確認」と明記する（確認したふりをしない）

## やってはいけないこと

- `export const dynamic = "force-static"` 等でキャッシュを強制すること。`HIT` にならなければ原因を調べて PR に書く
- 期間の定数に仕様書の表の 2 件以外を足すこと
- 大会トップに FAQPage 構造化データを足すこと
- シーズンページの表示・文言を変えること
- 新しいクエリ関数を `lib/db/queries/` に足すこと
- 新しいテストを、修正前の実装でも通る形で書くこと

## 完了時

- PR 本文に: 変更ファイル一覧、受け入れ条件 1〜16 それぞれの確認方法と結果、「壊して落ちた」確認の内容、スクリーンショット、未確認の項目
- 仕様書からの逸脱があれば理由を書く
- PR 作成まで。マージはしない
