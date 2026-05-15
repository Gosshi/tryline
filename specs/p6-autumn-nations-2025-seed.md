# Autumn Nations Series 2025 データ投入

## 背景

`/c/autumn-nations/2025` ページが「試合データを準備中です」と空状態になっている。
Autumn Nations Series 2025 は 2025年11月1日〜11月29日に実施済みのシーズンであり、
データが未投入であることが原因と考えられる。

ターゲットユーザー（DAZN/J SPORTS で海外ラグビーを観るファン）にとって
秋のテストマッチウィークは重要コンテンツであるため早急に解消する。

## スコープ

対象:
- Autumn Nations Series 2025 シーズンの試合データ投入
- 対象 Wikipedia ページ: `https://en.wikipedia.org/wiki/2025_Autumn_Nations_Series`

対象外:
- 試合イベント（得点経過）のバックフィル（データ投入完了後に別途実施）
- コンテンツ生成（レビュー・プレビュー）

## 前提確認

実作業前に以下を確認する:

```sql
-- seasons テーブルに 2025 レコードが存在するか
SELECT s.id, s.slug, s.name, COUNT(m.id) as match_count
FROM seasons s
LEFT JOIN matches m ON m.season_id = s.id
JOIN competitions c ON c.id = s.competition_id
WHERE c.family = 'autumn-nations'
GROUP BY s.id, s.slug, s.name
ORDER BY s.slug DESC;
```

- 2024 シーズンは既存データあり（正常稼働中）なのでシード手順の参考にする
- Wikipedia 2025 ページの HTML 構造が `div.vevent` 方式か、テーブル方式かを
  確認してから使用するパーサーを決定する

## 実行手順

### Step 1: Wikipedia HTML 構造の確認

```bash
curl -s "https://en.wikipedia.org/wiki/2025_Autumn_Nations_Series" \
  | grep -c "div.vevent\|class=\"vevent\""
# 0 件 → テーブル方式 → RC / URC パーサーを参照
# 1件以上 → vevent 方式 → 既存 parseWikipediaSeasonMatches を使用
```

### Step 2: シード（dry-run）

```bash
set -a; source .env.production.local; set +a

pnpm tsx scripts/seed-wikipedia-external-ids.ts \
  --family=autumn-nations \
  --season=2025 \
  --dry-run
```

期待値: matched ≥ 30 件（Autumn Nations は通常 5 週 × 6〜8 試合）

### Step 3: 本番シード

```bash
pnpm tsx scripts/seed-wikipedia-external-ids.ts \
  --family=autumn-nations \
  --season=2025
```

### Step 4: 試合件数を確認してデプロイ

```sql
SELECT COUNT(*) FROM matches m
JOIN seasons s ON s.id = m.season_id
JOIN competitions c ON c.id = s.competition_id
WHERE c.family = 'autumn-nations' AND s.slug = '2025';
```

## 受け入れ条件

- [ ] `/c/autumn-nations/2025` が試合カード一覧を表示する（空状態が解消）
- [ ] 試合カードにスコア・チーム名・日時が正しく表示される
- [ ] 週別グルーピング（`第N節` 形式）が正しく機能する
- [ ] Autumn Nations 2024 の既存データに影響がない

## 未解決の質問

1. Wikipedia 2025 Autumn Nations ページが `div.vevent` 方式かテーブル方式か
   → 実作業前に HTML を確認して使用パーサーを決定する
2. `seasons` テーブルに 2025 レコードが存在しない場合、どのスクリプトで作成するか
