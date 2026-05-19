# PR #72 — match_content に language カラムを追加

## 背景

英語コンテンツ対応の基盤として、`match_content` テーブルに `language` カラムを追加する。
既存レコードはすべて `'ja'`、英語コンテンツは `'en'` として区別する。

## スコープ

対象:
- `supabase/migrations/` に新規マイグレーションファイルを追加
- `match_content` を参照する TypeScript クエリのうち `language` フィルターが必要なものを更新

対象外:
- コンテンツ生成ロジック・UI は別 PR で対応

## マイグレーション

```sql
-- language カラム追加（既存レコードは 'ja' にデフォルト）
ALTER TABLE match_content
  ADD COLUMN language text NOT NULL DEFAULT 'ja'
  CHECK (language IN ('ja', 'en'));

-- unique constraint を language を含む形に変更
ALTER TABLE match_content
  DROP CONSTRAINT IF EXISTS match_content_match_id_content_type_key;

ALTER TABLE match_content
  ADD CONSTRAINT match_content_match_id_content_type_language_key
  UNIQUE (match_id, content_type, language);
```

## TypeScript 側の変更

### パイプライン upsert（`lib/llm/pipeline.ts` 230行付近）

`onConflict` を新しい constraint に合わせ、`language` を明示的に指定する:

```ts
const { error: upsertError } = await db.from("match_content").upsert(
  {
    match_id: matchId,
    content_type: contentType,
    content_md_ja: finalNarrative,
    language: "ja", // 追加
    model_version: modelVersion,
    prompt_version: promptVersion,
    status: persistedStatus,
    qa_scores: finalQa,
    generated_at: new Date().toISOString(),
  },
  {
    onConflict: "match_id,content_type,language", // 変更
  },
);
```

### 試合ページのコンテンツ取得クエリ（`lib/db/queries/matches.ts`）

`match_content` から `content_md_ja` を取得している箇所すべてに `.eq("language", "ja")` を追加し、英語行が混入しないようにする。

### `post-to-x` cron（`app/api/cron/post-to-x/route.ts`）

既存クエリに `.eq("language", "ja")` を追加（英語投稿は PR #75 で対応）。

## 完了の定義

- [ ] `match_content` に `language` カラムが追加され、既存レコードが `language = 'ja'` になっている
- [ ] unique constraint が `(match_id, content_type, language)` に更新されている
- [ ] 試合ページ・X cron 等の既存動作が変わらない
- [ ] TypeScript エラーなし・`pnpm build` 通過
