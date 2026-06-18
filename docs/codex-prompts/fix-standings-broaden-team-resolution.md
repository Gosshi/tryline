# Codex プロンプト: 順位表チーム解決を全チームに広げる（top-14/premiership 取りこぼし）

仕様: `specs/fix-standings-broaden-team-resolution.md` を参照（インライン展開しない）。

## タスク

PR #428 で `loadCompetitionTeams` を「matches 出場チーム」導出にしたが、**試合取り込みが薄い大会で候補が欠ける**:
- top-14: matches に6チームしか無い（14チーム中）→ matched 5/13
- premiership: matches に9チーム → matched 9/10

不足チームの **team レコードは DB に全て存在**（Clermont/Toulon/Lyon/Bordeaux/Castres/Perpignan/Vannes 等、name_ja 付き）。`WIKIPEDIA_TEAM_NAME_MAP` も仏クラブ対応済み。→ 候補集合が狭いだけ。

## 変更（`scripts/backfill-standings.ts`）

順位表チーム解決を **全チーム解決**に広げる:
1. `teams` を全件 `select("id, name, english_name, slug")` でロード
2. 既存 `buildStandingsTeamLookup`（name / english_name / slug / `WIKIPEDIA_TEAM_NAME_MAP` エイリアス）で各 standings 行を解決
3. **曖昧回避**: 同名が複数 team に解決したら、その大会の matches 出場チーム（現行の matches 由来集合）を tie-break に優先。一意に決まらなければ未マッチ
4. 未マッチ行は `console.warn("[standings] unmatched team", { name })` でログ

`buildStandingsTeamLookup` のマッチング自体は変更しない（渡す候補集合を広げるのが主眼）。matches 由来ロジックは tie-break 用に残してよい。

## テスト
- matches に出場しないが DB に在るチーム（例: Clermont）が解決される単体テスト
- 同名が複数ある場合に matches 出場チームが優先される単体テスト（合成データで）
- 未マッチ時にログが出る

## 受け入れ条件（完了の定義）
- ビルド・typecheck・lint・既存テスト緑
- `--family=top-14 --season=2025-26 --dry-run` で matched≈13
- `--family=premiership --season=2025-26 --dry-run` で matched=10
- `--family=urc --season=2025-26 --dry-run` が 16/16 のまま（回帰なし）
- 誤マッチが起きない（曖昧時は matches 優先・決まらなければ未マッチ＋ログ）
- 本番取り込み（`--confirm-owner-approved`）は Owner 実行

## 対象外
- SRP / league-one の parsed=0（別 parser 問題・別 spec）

## 参考
- 現行解決: `scripts/backfill-standings.ts` の `loadCompetitionTeams` / `buildStandingsTeamLookup` / `collectCompetitionTeamIds`
- 名前マップ: `lib/scrapers/wikipedia-team-name-map.ts`
