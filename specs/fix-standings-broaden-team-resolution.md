# fix-standings-broaden-team-resolution

## 背景

[[fix-standings-team-matching]]（PR #428）で `loadCompetitionTeams` を `competition_teams`（空）→「matches 出場チーム」導出に変更し、URC は matched 16/16 になった。しかし全大会 dry-run（2026-06-18）で取りこぼしが判明:

| 大会 | parsed | matched |
|---|---|---|
| urc | 16 | 16 ✅ |
| premiership | 10 | 9 |
| top-14 | 13 | 5 |
| super-rugby-pacific | 0 | 0（別問題：parse=0） |
| league-one | 0 | 0（別問題：parse=0） |

### 根因（本番DB検証）

`matches 出場チーム`導出は、**試合取り込みが薄い大会で候補が不完全**になる:
- top-14 2025-26 は DB の matches に **6チーム分しか無い**（Top14は14チーム）。残り8チームが候補から漏れる
- premiership は matches に9チーム（10チーム中1欠落）

しかし**不足チームの team レコードは DB に全て存在する**（確認済み: ASM Clermont Auvergne/RC Toulon/Lyon OU/Union Bordeaux Bègles/Castres Olympique/USA Perpignan/RC Vannes、いずれも name_ja 付き）。`WIKIPEDIA_TEAM_NAME_MAP` も仏クラブを概ねカバー済み。

→ **名前マップの穴ではなく、候補チーム集合の取り方が狭すぎる**のが原因。

## スコープ

対象:
- `scripts/backfill-standings.ts`: 順位表チームの解決を **「matches 由来候補」から「全チームを name-map/エイリアスで解決」に広げる**
- 未マッチ行の team 名を dry-run ログに出力（穴の可視化。元 spec の受け入れ条件 #5 が未実装）

対象外:
- SRP / league-one の `parsed=0`（Wikipedia ページ/表構造の parser 問題。別 spec `fix-standings-parse-srp-leagueone` で対応）
- `WIKIPEDIA_TEAM_NAME_MAP` の大規模拡充（現状で概ね足りる。ログで判明した残ミスのみ追補）

## 変更詳細

`scripts/backfill-standings.ts` のチーム解決:
1. `teams` を**全件**（`id, name, english_name, slug`）ロードし、既存 `buildStandingsTeamLookup` のエイリアス（name / english_name / slug / `WIKIPEDIA_TEAM_NAME_MAP` 経由）で解決する
2. **曖昧回避**: 同名が複数解決した場合は、その大会の matches に出場するチームを優先（matches 由来集合を tie-break に使う）。一意に決まらなければ未マッチ扱い＋ログ
3. 未マッチの standings 行は `console.warn` で team 名を出す（例: `[standings] unmatched: "<name>"`）

これで top-14（14チーム DB に在る）・premiership（10チーム）が候補に揃い、解決できる。

## 受け入れ条件
1. `--family=top-14 --season=2025-26 --dry-run` で matched が parsed に近い（13前後）
2. `--family=premiership --season=2025-26 --dry-run` で matched=10
3. urc は回帰せず 16/16 のまま
4. 誤マッチ（別大会の同名チームに誤って紐付け）が起きない（曖昧時は matches 優先、決まらなければ未マッチ）
5. 未マッチ行は team 名がログに出る
6. ビルド・typecheck・lint・既存テスト緑＋解決ロジックの単体テスト（matches に無いが DB に在るチームが解決される / 同名曖昧は matches 優先）

## 未解決の質問
- 同名チームが現実に複数あるか（例: 「Lions」「Bulls」等）を Codex が確認し、tie-break が必要か判断。無ければ全件解決のみで十分
