# add-world-rugby-2025-seasons: 2025 年シーズンの competition ID 追加

## 背景

`scripts/import-world-rugby-historical.ts` の `COMPETITION_ID_MAP` と `DEFAULT_TO_YEAR` が
2024 止まりになっており、2025 シーズンがインポート対象外になっている。
World Rugby API で確認した 2025 年の competition ID を追加し、2025 まで取得できるようにする。

## 確認済み Competition ID

| 大会 | altId |
|------|-------|
| Pacific Nations Cup 2025 | `0c6a4bb9-4cf9-4960-a587-0022dd2985a4` |
| Autumn Nations Series 2025 | `03cdc8d6-d13d-4e47-962e-3c0663306cb3` |

両大会とも全試合完了済み（PNC: 11試合、Autumn Nations: 22試合）。

## 変更内容: `scripts/import-world-rugby-historical.ts`

### 1. `DEFAULT_TO_YEAR` を 2025 に更新

```typescript
const DEFAULT_TO_YEAR = 2025;
```

### 2. `COMPETITION_ID_MAP` に 2025 エントリを追加

```typescript
export const COMPETITION_ID_MAP: Record<
  WorldRugbyCompetitionFamily,
  Record<string, string>
> = {
  "autumn-nations": {
    // 2020: ID 2009 は PNC 大会のため除外
    "2021": "2050",
    "2022": "2091",
    "2024": "c805a102-6cbe-4eed-a158-f5878cf1f162",
    "2025": "03cdc8d6-d13d-4e47-962e-3c0663306cb3",
  },
  pnc: {
    "2022": "2104",
    "2024": "735a21a5-9069-4fad-810e-81806f9c47a4",
    "2025": "0c6a4bb9-4cf9-4960-a587-0022dd2985a4",
  },
};
```

## 完了条件

- `pnpm tsc --noEmit` パス
- `import-world-rugby-historical.ts --dry-run` を実行したとき以下が出力される:
  - `[target] autumn-nations/2025: 03cdc8d6-d13d-4e47-962e-3c0663306cb3`
  - `[target] pnc/2025: 0c6a4bb9-4cf9-4960-a587-0022dd2985a4`

## ブランチ・PR

- ブランチ: `feat/world-rugby-2025-seasons`
- PR タイトル: `feat: add 2025 season IDs for Autumn Nations and PNC`
