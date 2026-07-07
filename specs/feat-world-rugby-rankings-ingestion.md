# 世界ラグビーランキングの週次取り込み

## 背景

ホーム「最近のレビュー」で、どの試合をヒーローカードにするか（`fix-home-recent-reviews-round-grouping.md` で節単位のグルーピングは実装済み）を、生成順ではなく「対戦カードのレベル」で決めたい（Owner、2026-07-07〜08の壁打ちで合意）。国代表戦（Six Nations・Rugby Championship・Nations Championship・Autumn Nations・PNC・RWC）については、World Rugby の世界ランキングが「対戦カードのレベル」を測る客観的な指標として使える。

調査の結果、Wikipedia の [World Rugby Rankings](https://en.wikipedia.org/wiki/World_Rugby_Rankings) ページに Rank / Change / Team / Points の4列だけのシンプルな表があり、上位30チームが掲載され、週次更新されている（World Rugby自体が毎週月曜に更新するため）。本プロジェクトは既に同種のWikipediaスクレイピング（`lib/scrapers/wikipedia-standings.ts`、`lib/ingestion/sources/wikipedia-*.ts`）を多用しており、同じパターンで実装できる。

本specは「大会をまたいだヒーロー選定」（`feat-home-multi-competition-featured-reviews.md`、未着手・本spec完了後に着手）の前提となるデータ基盤。

## スコープ

対象:
- 新規スクレイパー: `lib/scrapers/wikipedia-world-rankings.ts`（`lib/scrapers/wikipedia-standings.ts` と同じ構成でよい。`scrapeWorldRugbyRankings(): Promise<ParsedRankingRow[]>` のような関数を用意する）
- チーム名解決: 既存の `lib/scrapers/wikipedia-team-name-map.ts`（`WIKIPEDIA_TEAM_NAME_MAP` / `mapWikipediaTeamName`）を再利用する
- DBマイグレーション: `teams` テーブルに `world_ranking integer null`・`world_ranking_updated_at timestamptz null` を追加（`supabase/migrations/` に `YYYYMMDDHHMMSS_add_team_world_ranking.sql` として作成。命名は既存ファイルに倣う）
- 取り込みスクリプト/ロジック: `lib/ingestion/world-rankings.ts`（`lib/ingestion/standings.ts` の `upsertCompetitionStandings` と同様の役割。`upsertTeamWorldRankings(rows, teamLookup)` 等）
- 新規cron API route: `app/api/cron/ingest-world-rankings/route.ts`（`app/api/cron/ingest-live-competitions/route.ts` を参考に、認証は `assertCronAuthorized` を使う）
- 新規GitHub Actions workflow: `.github/workflows/cron-ingest-world-rankings.yml`（`.github/workflows/cron-live-pipeline.yml` を参考に、週次スケジュール。例: 毎週月曜 03:00 UTC = 12:00 JST。World Rugbyのランキング更新（月曜）を待ってから取り込む）

対象外:
- クラブチームの順位表（`feat-fix-top14-srp-standings-weekly.md` の対象）
- ホームページのヒーロー選定ロジック自体（`feat-home-multi-competition-featured-reviews.md` の対象）
- Top30圏外のチーム（該当チームは `world_ranking = null` のまま。ヒーロー選定時のフォールバック扱いは別specで定義）

## データモデル変更

`teams` テーブルに以下を追加するマイグレーション:

```sql
alter table teams
  add column world_ranking integer,
  add column world_ranking_updated_at timestamptz;
```

## API サーフェス

新規cron route `POST /api/cron/ingest-world-rankings`（`CRON_SECRET` 認証、既存パターン踏襲）。

## LLM 連携

なし

## 実装詳細

1. `scrapeWorldRugbyRankings()` が Wikipedia の World Rugby Rankings ページから `{ teamName: string; rank: number; points: number }[]` を返す（既存の `parseCompetitionStandingsHtml` のテーブルパース手法を参考に、`table.wikitable` から Rank/Team/Points列を抽出する）
2. `WIKIPEDIA_TEAM_NAME_MAP` でチーム名を解決し、`teams.id` にマッチしたものだけ `world_ranking` / `world_ranking_updated_at` を upsert する
3. マッチしなかったチーム名は `console.warn` でログ出力する（`warnUnmatchedStandingsTeams` と同じパターン）
4. cron route は認証チェック後、上記の取り込みを実行し、取り込み件数・未マッチ件数をレスポンスに含める

## 受け入れ条件

1. `pnpm tsx scripts/...`（または相当のスクリプト）で World Rugby Rankings ページを取得し、少なくとも New Zealand・France・South Africa・England・Japan・Italy・Fiji・Wales・Argentina・Scotland の世界ランキングが `teams.world_ranking` に正しく反映される
2. 未マッチのチーム名がある場合、書き込みをスキップしログに残す（エラーで落ちない）
3. cronは週次で自動実行され、`world_ranking_updated_at` が更新される
4. 既存の `WIKIPEDIA_TEAM_NAME_MAP` の解決パターンを再利用し、新規の名前マッピングを大量に作らない（既存マップで解決できないチームのみ、必要最小限追加する）
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
6. 新規マイグレーションが `supabase/migrations/` の既存ファイルと同じ命名・記法規則に沿っている

## 未解決の質問

- 週次cronによる `world_ranking` の自動書き込みは、`scripts/backfill-standings.ts` にある「Owner明示承認が無いと書き込めない」ゲートと違い、**自動で書き込む設計**を想定している（既存の `ingest-live-competitions` 等、他の定期取り込みcronと同じ扱い）。この設計方針でよいかOwner確認が必要
- cronの実行時刻（月曜03:00 UTC）はWorld Rugbyの実際の更新タイミングの仮置き。ズレがあれば調整可能
