# Top 14 2024-25「Round 0」表示バグおよびデータ不備修正

## 背景

`/c/top-14/2024-25` ページで2つの問題が確認されている。

1. **「ROUND 0」表示バグ**: ページ最上部に「ROUND 0」という見出しが表示される。
   `round_number = 0` の試合データがそのまま表示されており、
   ユーザーには意味不明なラベルになっている。

2. **シーズン期間が2週間しか表示されない**: ページヘッダーに
   「2025年6月13日〜2025年6月28日」と表示されており、
   正規シーズン（9月〜翌6月）のデータが未投入と考えられる。

なお `p4-top14-event-seed.md` は Top 14 **2025-26** のイベントシードであり、
本スペックは **2024-25** のラベルバグとデータ不備を対象とする。

## スコープ

### 問題1: Round 0 ラベル修正（コード変更）

対象:
- ラウンドラベルを表示するコンポーネント（`components/season-matches.tsx` または相当）

対象外:
- `round_number = 0` のデータ削除（まず表示を修正し、データは別途評価）

### 問題2: 正規シーズンデータ投入（データ操作）

対象:
- Top 14 2024-25 の正規シーズン試合データ

対象外:
- Top 14 2025-26（`p4-top14-event-seed.md` で対応中）

## 変更内容

### 問題1: Round 0 ラベル修正

実作業前に `round_number = 0` が何の試合かを DB で確認する:

```sql
SELECT m.kickoff_at, t1.name AS home, t2.name AS away, m.round_number
FROM matches m
JOIN teams t1 ON t1.id = m.home_team_id
JOIN teams t2 ON t2.id = m.away_team_id
JOIN seasons s ON s.id = m.season_id
JOIN competitions c ON c.id = s.competition_id
WHERE c.family = 'top-14' AND s.slug = '2024-25' AND m.round_number = 0
ORDER BY m.kickoff_at;
```

確認結果に応じてラベルを決定する:

| round_number | 想定ラベル |
|-------------|-----------|
| 0 | 「プレーオフ予選」または「Relegation Play-off」 |

ラウンドラベル変換ロジックをコンポーネントに追加する:

```tsx
function getRoundLabel(roundNumber: number): string {
  if (roundNumber === 0) return "プレーオフ予選";
  return `Round ${roundNumber}`;
}
```

### 問題2: 正規シーズンデータ投入

Top 14 2024-25 の Wikipedia URL: `https://en.wikipedia.org/wiki/2024%E2%80%9325_Top_14`

`p4-top14-event-seed.md` によると Top 14 の HTML 構造は
`div.vevent`（`.summary` クラスなし）であり、
`parseWikipediaSeasonMatches` がそのまま使える。

```bash
set -a; source .env.production.local; set +a

# 現在の試合数を確認
# SELECT COUNT(*), MIN(kickoff_at)::date, MAX(kickoff_at)::date
# FROM matches m JOIN seasons s ON s.id = m.season_id
# JOIN competitions c ON c.id = s.competition_id
# WHERE c.family = 'top-14' AND s.slug = '2024-25';

# dry-run（期待値: 182件前後、Round 1〜26 × 7試合）
pnpm tsx scripts/seed-wikipedia-external-ids.ts \
  --family=top-14 \
  --season=2024-25 \
  --dry-run

# 確認後に本番シード
pnpm tsx scripts/seed-wikipedia-external-ids.ts \
  --family=top-14 \
  --season=2024-25
```

## 変更ファイル

- `components/season-matches.tsx`（または相当コンポーネント）: Round 0 ラベル修正

## 受け入れ条件

- [ ] `/c/top-14/2024-25` の最上部に「ROUND 0」という見出しが表示されない
- [ ] `round_number = 0` の試合が適切なラベル（「プレーオフ予選」等）で表示される
- [ ] シーズン期間の表示が正規シーズン全体（2024年9月〜2025年6月）を反映する
- [ ] Round 1〜26 の試合カードが表示される
- [ ] 他大会（Premiership / URC 等）のラウンド表示に影響がない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

1. `round_number = 0` の試合が具体的に何の試合か（プレーオフ予選？特別マッチ？）
   → DB 確認後に適切なラベルを決定する
2. `seed-wikipedia-external-ids.ts` が `--season=2024-25` オプションに対応しているか確認
