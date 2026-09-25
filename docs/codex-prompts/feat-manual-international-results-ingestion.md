# Codex 指示書: 手動で登録した国際試合の結果と得点経過を、自動で取り込む

仕様書: `specs/feat-manual-international-results-ingestion.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## 作るもの

`lib/ingestion/manual-international-results.ts` の `applyManualInternationalResults`。Live Pipeline の取り込み（`ingestAllLiveCompetitions`）の最後に呼ぶ。

- 手動で登録した国際試合（`external_ids.source = "manual"`）のうち、キックオフから 2 時間〜7 日で、スコアが無い試合が対象。
- Wikipedia「〈年〉 men's rugby union internationals」の結果の枠（`{{rugbybox}}`）から、略号の組と日付で **1 つだけ**見つけたときに、スコアを入れる。
- 得点経過は、ページの HTML から `findEventBlockByTeams` で 1 試合のブロックを選べたときだけ入れる。

**急ぐ理由:** オーストラリア 対 南アフリカ（2026-09-27 09:30 UTC）の結果を、この仕組みで入れたい。

## 使う既存の部品（新しく書かない）

- `fetchWikipediaWikitext`、`parseWikitextTemplates`（`lib/ingestion/sources/wikipedia-wikitext.ts`）
- 略号と日付の読み取り: `parseInternationalFixtures`（`lib/audit/missing-internationals.ts:84`）。スコアを足す必要があれば、同じファイルの読み取りを広げる形にする（監査の動きは変えない）。
- `parseScoreText`（`lib/ingestion/sources/live-source-utils.ts:22`）
- `findEventBlockByTeams`（`lib/ingestion/wikipedia-event-block.ts:96`）
- `parseMatchEventsFromVeventHtml`（`lib/scrapers/wikipedia-match-events.ts:249`）
- `upsertMatchEvents`（`lib/ingestion/events.ts`。イベントの合計がスコアと合わなければ書き込まない）
- `fetchWithPolicy`（robots.txt とレート制限を守る既存の取得）

## 触るファイル

- 新規 `lib/ingestion/manual-international-results.ts`
- `lib/ingestion/live-competitions.ts`（呼び出しを 1 か所足す）
- `lib/audit/missing-internationals.ts`（スコアの読み取りが必要な場合だけ）
- テストと fixture（実際のページから保存した wikitext と HTML）

## 守ること

- **ページ全体を解析に渡す経路を作らない。** 得点経過は、`findEventBlockByTeams` で 1 試合のブロックを選べたときだけ入れる。
- 対応する結果の枠が 1 つに絞れないとき、ホームとアウェイが逆のとき、スコアが空のときは、何も書き込まない。
- 更新は試合の id で 1 行だけ。新しい試合は作らない。
- `external_ids.source = "manual"` は残す。
- この手順の失敗で、Live Pipeline 全体を失敗させない（JRFU の手順と同じく、例外を捕まえてログに出す）。

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行する（**3 つとも必ず実行し、結果を完了報告に含める**）。
- 「壊して落ちる」確認（コミットしない）: ブロックを選べないときにページ全体を渡すようにすると、受け入れ条件 3 のテストが落ちること。内容と結果を PR 本文に書く。

## やってはいけないこと

- 本番 DB への書き込みを伴う実行（テストはモック。本番での動作確認は Claude Code がマージ後に行う）。
- 仕様書に無い取得元（Wikipedia 以外）を足すこと。

## 完了時

- PR 本文に書くこと:
  - 変更したファイルの一覧
  - 受け入れ条件 1〜5 のそれぞれについて、確認の方法と結果
  - 「壊して落ちた」確認の内容
  - fixture をどのページのどの試合から保存したか
- ブランチは main から新しく切る。共有の作業ツリーにある未コミットの差分を巻き込まない。`git stash -u` は使わない。
- PR の作成まで。マージはしない。
