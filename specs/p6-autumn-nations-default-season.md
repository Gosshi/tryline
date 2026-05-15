# Autumn Nations デフォルトシーズン修正

## 背景

`/c/autumn-nations` にアクセスすると「試合データを準備中です」と表示される。
原因は最新シーズン（2026）がデフォルト表示されているが、2026 は未来のシーズンで
データが存在しないためである。

Autumn Nations は例年 11 月に開催されるため、ユーザーが 2026 年 11 月以前に
アクセスした場合、常に空状態になる。直近の実施済みシーズン（2024 または 2025）を
デフォルト表示すべきである。

## スコープ

対象:
- `/c/autumn-nations` の「最新シーズン」自動選択ロジック

対象外:
- Autumn Nations 2025 のデータ投入（`p6-autumn-nations-2025-seed.md` で対応）
- 他大会のデフォルト選択ロジック（現状問題なし）

## 変更内容

### 現状

`/c/autumn-nations` は `seasons` テーブルの最大 `slug` をデフォルト選択している。
`slug` の文字列降順ソートでは `2026 > 2025 > 2024` となるため、空の 2026 が選ばれる。

### 修正後

「試合データが存在する最新シーズン」をデフォルト選択するロジックに変更する。

```ts
// lib/db/competitions.ts または相当箇所
// 変更前
const latestSeason = seasons.sort((a, b) => b.slug.localeCompare(a.slug))[0];

// 変更後: 試合が 1 件以上あるシーズンを優先
const latestSeasonWithMatches =
  seasons
    .filter(s => s.match_count > 0)
    .sort((a, b) => b.slug.localeCompare(a.slug))[0]
  ?? seasons.sort((a, b) => b.slug.localeCompare(a.slug))[0];
```

`match_count` をシーズン一覧クエリに含める:

```sql
SELECT s.*, COUNT(m.id) AS match_count
FROM seasons s
LEFT JOIN matches m ON m.season_id = s.id
JOIN competitions c ON c.id = s.competition_id
WHERE c.family = $1
GROUP BY s.id
ORDER BY s.slug DESC;
```

### 対象大会の判断

Autumn Nations（毎年 11 月開催）はシーズン開始前の期間が長いため、
この「データありシーズン優先」ロジックを全大会に適用しても問題ない。
ただし安全のため、まず Autumn Nations で動作確認してから全大会に展開する。

## 変更ファイル

- `lib/db/competitions.ts`（または大会・シーズン一覧クエリを返す相当ファイル）
- `app/c/[family]/page.tsx`（デフォルトシーズン選択箇所）

## 受け入れ条件

- [ ] `/c/autumn-nations` がデータ存在シーズン（2024 または 2025）を自動選択して表示する
- [ ] 空の 2026 シーズンがデフォルト表示されない
- [ ] シーズンセレクタには 2026 も選択肢として残っている（将来データ投入時のため）
- [ ] 他大会（Premiership / URC 等）のデフォルト選択に影響がない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

1. Autumn Nations 2025 のデータ投入（`p6-autumn-nations-2025-seed.md`）が完了した後、
   デフォルトは 2025 に自動的に切り替わるか確認が必要
2. 「データありシーズン優先」ロジックを全大会に展開するか、Autumn Nations のみとするか
