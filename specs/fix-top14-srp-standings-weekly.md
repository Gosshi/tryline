# Top14・Super Rugby Pacific 順位表の修正と週次自動化

## 背景

`feat-home-multi-competition-featured-reviews.md`（未着手）でクラブ戦のヒーロー選定に順位表データを使う予定だが、現状 `competition_standings` テーブルには Premiership・URC・Six Nations・RWC のデータしかなく、**Top 14・Super Rugby Pacific にはデータが無い**（本番DB確認済み、2026-07-08）。

原因を `scripts/backfill-standings.ts --dry-run` で実地確認した:

**Top 14**（`family=top-14 season=2025-26`）: `parsed=13 matched=12`
- `Montauban` のみ未マッチ。原因は名前マッピングの穴ではなく、**`teams` テーブルに Montauban のレコード自体が存在しない**（`select * from teams where name ilike '%montauban%'` が0件）
- パース時に `Skipping standings row with non-numeric Toulouse total points: 86[a]` という警告が出る。Wikipediaの脚注記号（`[a]`等）が数値カラムに混入し、パースをスキップさせている

**Super Rugby Pacific**（`family=super-rugby-pacific season=2026`）: `parsed=0 matched=0`
- `lib/scrapers/wikipedia-standings.ts` の `parseCompetitionStandingsHtml` が該当ページから1件もパースできていない（`console.warn("No compatible competition standings rows were found.")` が出力される）
- 該当ページ（`2026 Super Rugby Pacific season`）には Pos/Team/Pld/W/D/L/PF/PA/PD/TF/TA/TB/LB/Pts/Qualification という11チーム分の表が実在することをWebFetchで確認済み。Top14と類似した列構成に見えるが、`resolveColumnIndexes`（同ファイル）のヘッダーテキスト一致条件がこのページの表現と噛み合っていない可能性が高い

さらに、`scripts/backfill-standings.ts` は**手動CLIスクリプト**であり（`--confirm-owner-approved` フラグ必須）、どの大会も自動更新されていない。全大会が「Ownerが気づいたときに手動実行する」運用になっている。

## スコープ

対象:
1. **Montaubanのチームレコード追加**: `teams` テーブルに USM Montauban のレコードを追加する（マイグレーションまたはシードスクリプト。名前・slug・short_code・name_ja は Top14公式サイトかWikipediaの実データを参照して正確な値を使うこと。推測で埋めない）
2. **数値パースの脚注除去**: `lib/scrapers/wikipedia-standings.ts` の数値パース処理（`parseInteger` / `parseOptionalInteger` 付近）で、`86[a]` のような末尾の `[数字またはアルファベット]` 脚注記号を除去してから整数変換する
3. **Super Rugby Pacific のパース修正**: `parseCompetitionStandingsHtml` / `resolveColumnIndexes` が対象ページの表を認識できない原因を特定し修正する。実際のページHTMLを取得して調査すること（対象URL: `resolveWikipediaStandingsUrl("super-rugby-pacific", "2026")` が返すURL）
4. **週次自動化**: `scripts/backfill-standings.ts` のロジックを再利用し、新規cron API route（`app/api/cron/ingest-standings/route.ts` 等）と週次GitHub Actions workflow（`.github/workflows/cron-ingest-standings.yml`）を追加する。`SupportedFamily` に列挙されている全9大会（`autumn-nations` / `league-one` / `pnc` / `premiership` / `rugby-championship` / `six-nations` / `super-rugby-pacific` / `top-14` / `urc`）を対象にループし、各大会の最新シーズンの順位表を自動更新する

対象外:
- 世界ランキング取り込み（`feat-world-rugby-rankings-ingestion.md` の対象）
- ホームページのヒーロー選定ロジック（`feat-home-multi-competition-featured-reviews.md` の対象）
- League One の順位表（Wikipedia以外のソース〈league-one.jp〉が必要で、URL構造が未確認。本specでは既存の `SupportedFamily` に含まれてはいるが、動作確認・修正は対象外とする。動かない場合はログに残るだけでよい）
- `scripts/backfill-standings.ts` 自体（手動実行用CLIとして残す。cronは別ロジックとして新規に用意し、この手動スクリプトを壊さない）

## データモデル変更

`teams` テーブルに Montauban の1レコードを追加（INSERT、マイグレーションまたはシード）。新規カラムは不要。

## API サーフェス

新規cron route `POST /api/cron/ingest-standings`（`CRON_SECRET` 認証、既存パターン踏襲）。

## LLM 連携

なし

## 受け入れ条件

1. `scripts/backfill-standings.ts --family=top-14 --season=2025-26 --dry-run` で `parsed=14 matched=14`（Montauban含め全チームマッチ、脚注混入行もスキップされず正しくパースされる）
2. `scripts/backfill-standings.ts --family=super-rugby-pacific --season=2026 --dry-run` で `parsed=11`（または実際のチーム数）でパース成功し、`matched` が0件でない
3. 週次cronが自動実行され、`competition_standings` に Top14・Super Rugby Pacific を含む対象大会のデータが定期的に更新される
4. 既存の Premiership・URC・Six Nations・RWC の順位表データ・既存の `scripts/backfill-standings.ts` の手動実行フローに regression がない
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
6. `pnpm test` で既存テストが通る（`lib/scrapers/wikipedia-standings.ts` の変更に対するテストケース追加を含む）

## 未解決の質問

- 週次cronによる自動書き込みは、手動スクリプトの「Owner承認必須」ゲートとは別に、**自動で書き込む設計**を想定している（`feat-world-rugby-rankings-ingestion.md` と同じ方針）。Owner確認が必要
- League One の順位表対応は対象外としたが、必要になれば別specで着手する
