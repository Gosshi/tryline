# fix-pnc-slug-and-title: PNC スラッグ重複と title バグの修正

## 背景

サイト評価で以下の2つのバグが発見された:

1. `/c/pnc` の `<title>` が "Pnc" になる  
   → `lib/format/competition.ts` の `FAMILY_DISPLAY_NAMES` に `"pnc"` キーが存在しないため、
   フォールバックの `family.replace(/-/g, " ").replace(/\b\w/g, ...)` が走り "Pnc" と表示される。

2. トップページの大会アーカイブに `/c/pacific-nations-cup` と `/c/pnc` が重複表示される  
   → DB の `competitions` テーブルに旧スラッグ `pacific-nations-cup` と新スラッグ `pnc` の
   2レコードが共存しているため。

## 変更内容

### 1. コード修正: `lib/format/competition.ts`

`FAMILY_DISPLAY_NAMES` に `"pnc"` エントリを追加する:

```typescript
const FAMILY_DISPLAY_NAMES: Record<string, string> = {
  "autumn-nations": "Autumn Nations",
  "league-one": "League One",
  "pacific-nations-cup": "Nations Cup",
  pnc: "Nations Cup",           // 追加
  premiership: "Premiership",
  "rugby-championship": "Rugby Championship",
  rwc: "RWC",
  "six-nations": "Six Nations",
  "super-rugby-pacific": "Super Rugby Pacific",
  "top-14": "Top 14",
  urc: "URC",
};
```

### 2. DB マイグレーション（Supabase SQL Editor で実行）

以下を順番に実行すること。

#### Step 1: 現状確認

```sql
SELECT id, slug, name
FROM competitions
WHERE slug IN ('pnc', 'pacific-nations-cup')
ORDER BY slug;
```

両スラッグのレコードが存在する場合のみ Step 2 以降を実行する。

#### Step 2: matches を pnc に統合

```sql
UPDATE matches
SET competition_id = (SELECT id FROM competitions WHERE slug = 'pnc')
WHERE competition_id = (SELECT id FROM competitions WHERE slug = 'pacific-nations-cup');
```

#### Step 3: competition_teams を pnc に統合

```sql
INSERT INTO competition_teams (competition_id, team_id)
SELECT (SELECT id FROM competitions WHERE slug = 'pnc'), team_id
FROM competition_teams
WHERE competition_id = (SELECT id FROM competitions WHERE slug = 'pacific-nations-cup')
ON CONFLICT DO NOTHING;

DELETE FROM competition_teams
WHERE competition_id = (SELECT id FROM competitions WHERE slug = 'pacific-nations-cup');
```

#### Step 4: 旧レコード削除

```sql
DELETE FROM competitions WHERE slug = 'pacific-nations-cup';
```

#### Step 5: pnc の name を確認・修正

```sql
UPDATE competitions SET name = 'Nations Cup' WHERE slug = 'pnc' AND name != 'Nations Cup';
```

## 完了条件

- `pnpm tsc --noEmit` パス
- `/c/pnc` の `<title>` が "Nations Cup — 全シーズン一覧 | Tryline" になる
- トップページの大会アーカイブに "Nations Cup" が1エントリのみ表示される
- "Pacific Nations Cup" / "Pnc" の文字列がどのページにも表示されない

## ブランチ・PR

- ブランチ: `fix/pnc-slug-and-title`
- PR タイトル: `Fix: resolve PNC slug duplicate and title display`
