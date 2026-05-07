# p3-generate-world-rugby-content: World Rugby 試合コンテンツ一括生成

## 背景

`p3-world-rugby-scraper` で PNC・Autumn Nations の試合データ・ラインアップ・イベントが
DB に入ったあと、finished 試合に対して recap を一括生成するスクリプトが必要。
`generate-league-one-content.ts` と同じパターンだが、competition.family で絞る。

## 前提条件

このスクリプトは `p3-world-rugby-scraper` の実装・実行完了後に使用する。

## 新規ファイル: `scripts/generate-world-rugby-content.ts`

**実行コマンド:**
```bash
# ドライランで対象試合数を確認
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/generate-world-rugby-content.ts --family pnc --season 2024 --dry-run

node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/generate-world-rugby-content.ts --family autumn-nations --season 2024 --dry-run

# 実行
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/generate-world-rugby-content.ts --family pnc --season 2024

node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/generate-world-rugby-content.ts --family autumn-nations --season 2024
```

**参照パターン:**
- `scripts/generate-league-one-content.ts` — ほぼ同一の構造
- `lib/cron/orchestrate.ts` — 既存コンテンツスキップのロジック
- `lib/llm/pipeline.ts:generateMatchContent` — コンテンツ生成呼び出し

**処理フロー:**

```
1. --family, --season, --dry-run 引数をパース
2. competitions テーブルから
   family = 指定ファミリー AND season = 指定シーズン
   の competition_id を取得（複数ある場合はすべて対象）
3. matches テーブルから当該 competition_id の finished 試合 ID を全件取得
4. match_content テーブルから content_type = "recap" かつ
   status IN ("draft", "published") の match_id を取得
5. 4 に含まれる match_id を除外（スキップ）
6. --dry-run の場合は件数だけ表示して終了
7. 残りの match_id に対して順次 generateMatchContent(matchId, "recap") を呼ぶ
8. 各試合の結果をログ出力（published / draft）
9. 完了時に集計（生成数・スキップ数・失敗数）を表示
```

**引数パース:**
```typescript
function parseArgs(argv: string[]) {
  let family: string | null = null;
  let season: string | null = null;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--family") {
      family = argv[i + 1] ?? null;
      i++;
    } else if (argv[i] === "--season") {
      season = argv[i + 1] ?? null;
      i++;
    } else if (argv[i] === "--dry-run") {
      dryRun = true;
    }
  }

  if (!family || !season) {
    console.error(
      "Usage: generate-world-rugby-content.ts --family FAMILY --season YEAR [--dry-run]",
    );
    process.exit(1);
  }

  return { family, season, dryRun };
}
```

**実装上の注意:**
- `generateMatchContent` は 1 試合あたり数秒かかる。`await` で順次実行すること（並列不可）
- エラーが 1 試合で発生しても止めない。`try/catch` でログだけ出して次へ進む
- preview は生成しない（過去試合のため不要）
- Supabase クライアントは `getSupabaseServerClient` を使う

## 完了条件

- `pnpm tsc --noEmit` パス
- `--dry-run` で対象試合数が表示される
- 実行すると既存コンテンツをスキップして不足分のみ生成される
- エラーが発生しても途中で止まらず最後まで実行される

## ブランチ・PR

- ブランチ: `feat/generate-world-rugby-content`
- PR タイトル: `Feat: bulk recap generation script for World Rugby competitions`
