# Codex 指示書: 代表戦の取りこぼし点検

仕様書: `specs/feat-missing-international-fixtures-audit.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コード・実ページが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## 直したいこと

単発のテストマッチや新しいシリーズは、誰かが気づかない限り DB に載らない（9/27 南ア × 豪、10/10・10/17 ブレディスローカップが実例）。
週 1 回、Wikipedia の「{年} men's rugby union internationals」と DB を照合し、**30 日以内で DB に無い代表戦を Discord に通知する。** 自動登録はしない。

## 触るファイル

新規:
- `lib/audit/missing-internationals.ts` — `parseInternationalFixtures`・`classifyInternationalFixtures`（純粋関数のみ）
- `app/api/cron/audit-missing-internationals/route.ts`
- `.github/workflows/cron-missing-internationals-audit.yml`
- `tests/fixtures/wikipedia-2026-mens-rugby-union-internationals.wiki` — `https://en.wikipedia.org/wiki/2026_men%27s_rugby_union_internationals?action=raw` を**そのまま保存**（手作りしない）。取得日をテストのコメントに書く
- `tests/lib/audit/missing-internationals.test.ts`
- `tests/api/audit-missing-internationals.test.ts`

変更:
- `lib/llm/notify.ts` — `notifyMissingInternationals` を追加（`notifyPrekickoffReadinessAudit` `:245-264` と同じ形。既存関数は変えない）

使う既存部品（新しく作らない）:
- `parseWikitextTemplates`・`fetchWikipediaWikitext`・`stripWikitextMarkup`（`lib/ingestion/sources/wikipedia-wikitext.ts`）
- `parseDmyDate`・`isMissingWikipediaPage`（`lib/ingestion/sources/live-source-utils.ts`）
- `loadAllPages`（`lib/db/pagination.ts`）
- ルートの形は `app/api/cron/audit-prekickoff-readiness/route.ts`、ワークフローの形は `.github/workflows/cron-prekickoff-readiness-audit.yml`

## 具体例（2026-09-23 の実ページで確認済み）

```
{{rugbybox
|date = 27 September 2026
|time = 17:30 [[Australian Western Standard Time|AWST]] ([[UTC+8]])
|team1 = {{ru-rt|AUS}}
|team2 = {{ru|RSA}}
|stadium = [[Perth Stadium]], [[Perth]]<ref>...</ref>
```

`home`/`away` で書かれた箱もある:

```
{{Rugbybox
|date = 10 October 2026
|time =  TBC [[Central Africa Time|CAT]] ([[UTC-02]])
|home = {{ru-rt|ZIM}}
|away = {{ru|GER}}
```

窓 2026-09-23〜10-23、DB に AUS × RSA（9/27）だけがあるときの期待値:
- missing: NZL × AUS（10/10）、AUS × NZL（10/17）
- present: AUS × RSA（9/27）
- unresolved: GIB × MLT（9/26）、ZIM × GER（10/10）

## 処理すべきエッジケース

1. `{{Rugbybox}}` と `{{rugbybox}}` の両方（`parseWikitextTemplates` は大文字小文字を区別しない）
2. `team1`/`team2` と `home`/`away` の両方
3. `name=` 付き（`England A`・`Chile XV`）や `RuA-rt` などのテンプレートは `nonSenior`
4. 時刻「TBC」。時刻は使わず日付だけで照合する
5. ホームとアウェイが DB と逆でも一致とみなす
6. Wikipedia の日付（現地）と DB の UTC 日付は前後 1 日ずれうる
7. 窓が年をまたぐときは翌年のページも取る。翌年のページが 404 なら飛ばす。それ以外の取得エラーは 500（通知しない）
8. 読めない箱は `unparsed` に入れて先へ進む。例外で全体を止めない

## テストで気をつけること

- 受け入れ条件 1 は**実ページの fixture で**書く。小さな手作りの箱は条件 2〜7 の補助としてだけ使う
- 受け入れ条件 13: 「ホーム・アウェイの順序まで一致を求める実装」「日付の完全一致を求める実装」で一時的に壊し、テストが落ちることを確認して PR 本文に書く（コミットしない）

## やってはいけないこと

- 見つけた試合を DB に登録すること（通知だけ）
- Wikipedia 以外を取得すること
- `unresolved` などを通知すること（件数は返り値にだけ出す）
- 既存の取り込み処理（`lib/ingestion/*`）の挙動を変えること

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test`（**型チェックも必ず実行し、結果を完了報告に含める**）
- デプロイ後の手動実行（受け入れ条件 15）は Claude Code が行う。PR では「未実施（デプロイ後）」と書けばよい

## 完了時

- PR 本文に: 変更ファイル一覧、受け入れ条件 1〜14 それぞれの確認方法と結果、「壊して落ちた」確認の内容
- PR 作成まで。マージはしない
