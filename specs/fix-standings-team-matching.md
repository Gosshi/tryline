# fix-standings-team-matching

## 背景

[[feat-evergreen-competition-guides]]（PR #427）の Part A、`scripts/backfill-standings.ts` の dry-run で:

```
Standings target: family=urc season=2025-26 parsed=16 matched=0
```

**パースは正常（URC 16チーム）だが matched=0**＝取り込み0件。

### 根因（本番DB検証 2026-06-18）

`loadCompetitionTeams(competition.id)` が **`competition_teams`（大会×チーム中間テーブル）** から候補チームを引いている。しかし `competition_teams` は **URC/premiership/super-rugby-pacific/top-14 で0行**（league-one だけ12行）。

→ 候補チームリストが空 → `buildStandingsTeamLookup` のエイリアスも空 → 全行 matched=0。

## スコープ

対象:
- `scripts/backfill-standings.ts` の `loadCompetitionTeams`（候補チーム取得）を、**`competition_teams` 依存から「その大会の matches に出場するチーム」導出に変更**

対象外:
- `competition_teams` の populate（別タスク。本修正で不要にする）
- name-map 自体の拡張（候補リストが入れば既存マッチングで概ね当たる。残ミスは別途）
- Part B（視聴方法）

## 変更詳細

`loadCompetitionTeams(competitionId)` を次のロジックに置換:
- `matches` から `competition_id = competitionId` の行を引き、`home_team_id` ∪ `away_team_id` の distinct セットを取得
- その team_id 群で `teams`（`id, name, english_name, slug`）をロード
- 返り値の形（`StandingsTeamRow[]`）は現状維持 → `buildStandingsTeamLookup` 以降は無改修

これで `competition_teams` 未populateでも候補が揃う。URC は150試合 → 出場16チームが確実に取れる。

## 受け入れ条件

1. `--family=urc --season=2025-26 --dry-run` で **matched が parsed に近い値**（16前後）になる
2. 主要大会（urc / premiership / super-rugby-pacific / top-14 / league-one）で matched > 0
3. `--confirm-owner-approved` 実行後、`competition_standings` に行が入り `/c/urc/2025-26` の `#standings` に順位表が表示
4. 既存テスト緑＋`loadCompetitionTeams` の単体テスト（matches由来でチームが取れる）
5. 残る未マッチ行があれば dry-run ログに team 名を出す（name-map 追補の手がかり）

## 未解決の質問

- 大会の matches がまだ無い新シーズン（例: まだ試合前）の standings はこの方式だと候補ゼロになりうる。その場合は全 teams フォールバック or competition_teams を別途 populate するか（当面は進行中シーズン対象なので影響小）
