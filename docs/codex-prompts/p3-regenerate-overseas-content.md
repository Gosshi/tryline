# p3-regenerate-overseas-content: 海外試合コンテンツ再生成スクリプト

## 背景

`fix-league-one-round-names` で海外試合の LLM プロンプトを改善した（選手名カタカナ表記）。
`preview@1.5.0` / `recap@1.6.0` より前に生成されたコンテンツは古いプロンプトで作成されているため、
現行バージョンのプロンプトで再生成する必要がある。

League One（`competition.family = "league-one"`）は別途日本語で生成済みのためスキップする。

## 新規ファイル: `scripts/regenerate-overseas-content.ts`

**実行コマンド:**
```bash
# ドライランで対象件数を確認
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/regenerate-overseas-content.ts --dry-run

# recap のみ再生成
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/regenerate-overseas-content.ts --content-type recap

# preview のみ再生成
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/regenerate-overseas-content.ts --content-type preview

# 特定ファミリーに絞る（例: six-nations）
node --env-file=.env.production.local tools/run-ts.cjs \
  scripts/regenerate-overseas-content.ts --family six-nations --content-type recap
```

**参照パターン:**
- `scripts/generate-league-one-content.ts` — 引数パースと順次実行のパターン
- `lib/llm/pipeline.ts:generateMatchContent` — コンテンツ生成（upsert で上書き済み）
- `lib/llm/prompts/generate-preview.ts` / `generate-recap.ts` — 現行 `PROMPT_VERSION` を import して比較

**処理フロー:**

```
1. --content-type, --family, --dry-run 引数をパース
   content-type のデフォルト: "recap"
2. match_content テーブルから
   - content_type = 指定の contentType
   - status IN ("draft", "published")
   の全件を取得（match_id, prompt_version を含む）
3. 各 match_id に対して matches + competitions を JOIN し、
   competition.family = "league-one" の試合を除外する
4. 現行 PROMPT_VERSION（generate-preview.ts / generate-recap.ts から import）と
   比較し、バージョンが古い match_id だけを対象とする
   （文字列比較ではなく != で判定）
5. --dry-run の場合は件数と competition.family 別の内訳を表示して終了
6. 残りの match_id に対して順次 generateMatchContent(matchId, contentType) を呼ぶ
7. 各試合の結果をログ出力（published / draft / error）
8. 完了時に集計（再生成数・失敗数）を表示
```

**引数パース:**
```typescript
type ContentType = "recap" | "preview";

function parseArgs(argv: string[]) {
  let contentType: ContentType = "recap";
  let family: string | null = null;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--content-type") {
      const v = argv[i + 1];
      if (v !== "recap" && v !== "preview") {
        console.error("--content-type must be recap or preview");
        process.exit(1);
      }
      contentType = v;
      i++;
    } else if (argv[i] === "--family") {
      family = argv[i + 1] ?? null;
      i++;
    } else if (argv[i] === "--dry-run") {
      dryRun = true;
    }
  }

  return { contentType, family, dryRun };
}
```

**バージョン比較:**
```typescript
import { PROMPT_VERSION as PREVIEW_VERSION } from "@/lib/llm/prompts/generate-preview";
import { PROMPT_VERSION as RECAP_VERSION } from "@/lib/llm/prompts/generate-recap";

const currentVersion = contentType === "recap" ? RECAP_VERSION : PREVIEW_VERSION;
// prompt_version が currentVersion と一致しない行のみ対象
```

**実装上の注意:**
- `generateMatchContent` は upsert するため、既存コンテンツを上書きする。意図通り。
- 1 試合あたり数秒かかる。`await` で順次実行すること（並列不可）
- エラーが 1 試合で発生しても止めない。`try/catch` でログだけ出して次へ進む
- Supabase クライアントは `getSupabaseServerClient` を使う（service role key 必要）

## データ取得クエリ

```typescript
// match_content から対象を絞る
const { data: contentRows } = await db
  .from("match_content")
  .select(`
    match_id,
    prompt_version,
    match:matches!match_content_match_id_fkey (
      competition:competitions!matches_competition_id_fkey (
        family
      )
    )
  `)
  .eq("content_type", contentType)
  .in("status", ["draft", "published"]);

// league-one を除外 & バージョンフィルタ & family フィルタ
const targets = (contentRows ?? []).filter((row) => {
  const f = (row.match as any)?.competition?.family;
  if (f === "league-one") return false;
  if (family && f !== family) return false;
  return row.prompt_version !== currentVersion;
});
```

## 完了条件

- `pnpm tsc --noEmit` パス
- `--dry-run` で対象件数と family 別内訳が表示される
- League One の試合が対象に含まれない
- 実行すると prompt_version が現行バージョンに更新される
- エラーが発生しても途中で止まらず最後まで実行される

## ブランチ・PR

- ブランチ: `feat/regenerate-overseas-content`
- PR タイトル: `Feat: regenerate overseas match content with updated katakana prompt`
