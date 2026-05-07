# p3-world-rugby-historical-backfill: World Rugby 過去シーズン一括インポート

## 背景

`p3-world-rugby-scraper` で `import-world-rugby-full.ts` が完成したあと、
PNC・Autumn Nations の 2020〜2024 シーズン分を一括インポートするスクリプトが必要。
`import-world-rugby-full.ts` を 1 シーズンずつループして呼び出す。

## 前提条件

このスクリプトは `p3-world-rugby-scraper` の実装完了後に使用する。

## 新規ファイル: `scripts/import-world-rugby-historical.ts`

**実行コマンド:**
```bash
# ドライラン（対象一覧を表示）
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/import-world-rugby-historical.ts --dry-run

# 実行（PNC + Autumn Nations の 2020〜2024 全シーズン）
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/import-world-rugby-historical.ts

# family を絞る
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/import-world-rugby-historical.ts --family pnc

# 特定シーズンのみ
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/import-world-rugby-historical.ts --family autumn-nations --from 2022 --to 2023
```

**参照パターン:**
- `scripts/import-world-rugby-full.ts` — 1 シーズン分のインポートロジック（参照・再利用）
- `lib/scrapers/world-rugby-schedule.ts:fetchWorldRugbySchedule` — p3-world-rugby-scraper で実装
- `scripts/import-league-one-full.ts` — 引数パースのパターン

**処理フロー:**

```
1. --family, --from, --to, --dry-run 引数をパース
   デフォルト: family = ["pnc", "autumn-nations"], from = 2020, to = 2024
2. family × season の組み合わせリストを生成
3. --dry-run の場合は組み合わせ一覧を表示して終了
4. 各 (family, season) ペアについて順次 import を実行:
   a. COMPETITION_ID_MAP から competitionId を取得
   b. `fetchWorldRugbySchedule(competitionId, season)` で試合一覧を取得
   c. 各試合を upsertMatches
   d. 各試合の `fetchWorldRugbyMatchDetail` → lineups + events upsert
   e. エラーは per-match でキャッチしてログ。1 試合失敗しても次へ進む
5. シーズン間の実行後に 5 秒 sleep（worldrugby.org への配慮）
6. 完了時に全体集計を表示（シーズン別: 試合数・成功・失敗）
```

**World Rugby の competitionId マッピング:**

```typescript
const COMPETITION_ID_MAP: Record<string, Record<string, string>> = {
  pnc: {
    // 2020/2021: COVID 未開催または World Rugby 上で ID なし → スキップ
    // 2023: RWC 開催年で大会 ID なし → スキップ
    "2022": "2104",
    "2024": "735a21a5-9069-4fad-810e-81806f9c47a4",
  },
  "autumn-nations": {
    // 2023: RWC 開催年で大会 ID なし → スキップ
    "2020": "2009",
    "2021": "2050",
    "2022": "2091",
    "2024": "c805a102-6cbe-4eed-a158-f5878cf1f162",
  },
};
```

**スキップ処理**: `COMPETITION_ID_MAP` に存在しない (family, season) ペアは
dry-run 時に `[skip] pnc/2021: no competition ID` と表示してスキップする。
エラーにはしない。

**引数パース:**
```typescript
function parseArgs(argv: string[]) {
  const allFamilies = ["pnc", "autumn-nations"];
  let families = allFamilies;
  let fromYear = 2020;
  let toYear = 2024;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--family") {
      families = [argv[i + 1] ?? "pnc"];
      i++;
    } else if (argv[i] === "--from") {
      fromYear = parseInt(argv[i + 1] ?? "2020", 10);
      i++;
    } else if (argv[i] === "--to") {
      toYear = parseInt(argv[i + 1] ?? "2024", 10);
      i++;
    } else if (argv[i] === "--dry-run") {
      dryRun = true;
    }
  }

  return { families, fromYear, toYear, dryRun };
}
```

**実装上の注意:**
- `fetchWorldRugbySchedule` / `fetchWorldRugbyMatchDetail` は `fetchWithPolicy` 経由（3 秒インターバル）
- シーズン間に追加の sleep を入れることで worldrugby.org への過負荷を避ける
- robots.txt を遵守すること（`p3-world-rugby-scraper` の `fetchWithPolicy` が処理済み）
- 1 回の実行は長時間（数時間）になる可能性がある。途中で止まっても再実行で重複なく続行できる（upsert）

## 完了条件

- `pnpm tsc --noEmit` パス
- `--dry-run` で対象 (family, season) リストが表示される
- 実行すると PNC 2020〜2024 および Autumn Nations 2020〜2024 が DB に入る
- `external_ids.source = "world-rugby"` が設定されている
- エラーが発生しても途中で止まらず最後まで実行される

## ブランチ・PR

- ブランチ: `feat/world-rugby-historical-backfill`
- PR タイトル: `Feat: historical backfill script for World Rugby competitions (2020-2024)`
