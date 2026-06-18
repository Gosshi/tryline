# Codex プロンプト: 順位表の matched=0 修正（competition_teams 依存をやめる）

仕様: `specs/fix-standings-team-matching.md` を参照（インライン展開しない）。

## タスク

`scripts/backfill-standings.ts --family=urc --season=2025-26 --dry-run` が `parsed=16 matched=0`。原因は `loadCompetitionTeams` が **`competition_teams`（中間テーブル）から候補チームを引いているが、そのテーブルが URC/premiership/SRP/top-14 で0行**のため候補ゼロ → 全行マッチ失敗。

`loadCompetitionTeams` を **`competition_teams` 依存から「その大会の matches 出場チーム」導出に変更**する。

## 変更（`scripts/backfill-standings.ts`）

`loadCompetitionTeams(competitionId)`:
1. `matches` から `competition_id = competitionId` の `home_team_id` / `away_team_id` を取得し、distinct な team_id セットを作る
2. その team_id 群で `teams` を `select("id, name, english_name, slug")` でロード
3. 既存の返り値型（`StandingsTeamRow[]`：`id`/`name`/`englishName`/`slug`）に整形して返す
   → `buildStandingsTeamLookup` 以降は無改修で動く

`competition_teams` への参照は削除（このスクリプト内のみ。他用途では残してよい）。

## テスト
- `loadCompetitionTeams`（または抽出した純関数）の単体テスト：matches の home/away team_id から distinct チームが取れること
- dry-run で URC が matched≈16 になることを示す（モック or 実データ前提のテストは適宜）

## 受け入れ条件（完了の定義）
- ビルド・typecheck・lint・既存テスト緑
- `--family=urc --season=2025-26 --dry-run` で matched が parsed に近い（16前後）
- 主要大会（urc/premiership/super-rugby-pacific/top-14/league-one）で matched > 0
- 残未マッチ行があれば dry-run ログに team 名を出す（name-map 追補の手がかり）
- 本番取り込み（`--confirm-owner-approved`）は Owner 実行

## 注意
- matches がまだ無い新シーズンは候補ゼロになりうる（当面は進行中シーズン対象なので可。spec の未解決質問参照）
- 既存の `buildStandingsTeamLookup` / name-map ロジックは変更しない（候補リストを正しく渡すのが本修正の主眼）
