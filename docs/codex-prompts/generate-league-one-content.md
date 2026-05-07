# generate-league-one-content: League One バルクコンテンツ生成スクリプト

## 概要

League One の finished 試合に対して recap を一括生成するスクリプト。
既存コンテンツ（status が `draft` または `published`）がある試合はスキップする。

## 新規ファイル: `scripts/generate-league-one-content.ts`

**実行コマンド:**
```bash
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/generate-league-one-content.ts --season 2024-25

node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/generate-league-one-content.ts --season 2025-26

# ドライランで対象試合数だけ確認
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/generate-league-one-content.ts --season 2024-25 --dry-run
```

**参照パターン:**
- `lib/cron/orchestrate.ts` — 既存コンテンツスキップのロジック（`match_content` テーブルを検索して除外）
- `lib/llm/pipeline.ts` — `generateMatchContent(matchId, contentType)` の呼び出し方
- `scripts/import-league-one-full.ts` — 引数パースのパターン

**処理フロー:**

```
1. --season 引数をパース（YYYY-YY 形式）
2. competitions テーブルから slug = "league-one-{season}" の competition_id を取得
3. matches テーブルから当該 competition_id の finished 試合 ID を全件取得
4. match_content テーブルから content_type = "recap" かつ
   status IN ("draft", "published") の match_id を取得
5. 4 に含まれる match_id を除外（スキップ）
6. --dry-run の場合は件数だけ表示して終了
7. 残りの match_id に対して順次 generateMatchContent(matchId, "recap") を呼ぶ
8. 各試合の結果（published/draft）をログ出力
9. 完了時に集計（生成数・スキップ数・失敗数）を表示
```

**実装上の注意:**
- `generateMatchContent` は 1 試合あたり数秒かかる。`await` で順次実行すること（並列不可）
- エラーが 1 試合で発生しても止めない。`try/catch` でログだけ出して次へ進む
- preview は生成しない（過去試合のため不要）

**引数パース:**
```typescript
function parseArgs(argv: string[]) {
  let season: string | null = null;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--season") {
      season = argv[i + 1] ?? null;
      i++;
    } else if (argv[i] === "--dry-run") {
      dryRun = true;
    }
  }

  if (!season || !/^\d{4}-\d{2}$/.test(season)) {
    console.error(
      "Usage: generate-league-one-content.ts --season YYYY-YY [--dry-run]",
    );
    process.exit(1);
  }

  return { season, dryRun };
}
```

## 完了条件

- `pnpm tsc --noEmit` パス
- `--dry-run` で対象試合数が表示される
- `--season 2024-25` を実行すると既存コンテンツをスキップして不足分のみ生成される
- エラーが発生しても途中で止まらず最後まで実行される

## ブランチ・PR

- ブランチ: `feat/generate-league-one-content`
- PR タイトル: `Feat: bulk recap generation script for League One`
