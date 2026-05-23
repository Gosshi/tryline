# パイプライン: content_md_ja カラムへの英語コンテンツ誤格納バグ修正

## 背景

`lib/llm/pipeline.ts:252` にて、言語に関わらず常に `content_md_ja` カラムへ
コンテンツを保存している。

```typescript
// 現状（バグ）
await db.from("match_content").upsert({
  match_id: matchId,
  content_type: contentType,
  content_md_ja: finalNarrative,  // language='en' でも ja カラムに書き込まれる
  language,
  ...
});
```

`language` カラムには正しく `"en"` が保存されているが、
コンテンツ本体は常に `content_md_ja` に格納される。
その結果:

- 英語レビューが `content_md_ja` カラムに入る
- `getRecentlyReviewedMatches` は `language = 'ja'` でフィルタしているため
  英語コンテンツは取得されないが、`content_md_ja` の意味的整合性が崩れる
- 将来的に `content_md_en` カラムを追加した場合に移行コストが増大する
- Pricing ページのサンプル表示が空になる一因

## スコープ

対象:
- `supabase/migrations/` — `content_md_ja` を `content_md` にリネームするマイグレーション追加
- `lib/llm/pipeline.ts` — カラム名を `content_md` に更新
- `lib/db/queries/matches.ts` — `content_md_ja` 参照箇所を `content_md` に更新
- `lib/db/types.ts`（または自動生成型ファイル）— 型定義を更新
- `content_md_ja` を参照している他のすべてのファイル（`grep -r "content_md_ja"` で全件確認）

対象外:
- `language` カラムの扱い（変更なし）
- EN コンテンツ用の専用カラム追加（`language` カラムで区別する現行方式を維持）
- RLS ポリシーの変更（カラム名変更のみなので既存ポリシーに影響しない）

## データモデル変更

### マイグレーション

ファイル名例: `20260524010000_rename_content_md_ja_to_content_md.sql`

```sql
ALTER TABLE match_content
  RENAME COLUMN content_md_ja TO content_md;
```

本番データは上書きされず、カラム名のみ変更される。
PostgreSQL の `RENAME COLUMN` は即時完了するためダウンタイム不要。

### 変更後のカラム構成（match_content テーブル）

| カラム | 型 | 変更 |
|--------|-----|------|
| content_md | text NOT NULL | リネーム（旧: content_md_ja） |
| language | text NOT NULL | 変更なし |
| content_type | text NOT NULL | 変更なし |

## API サーフェス

変更なし（外部向け API はこのカラムを直接公開していない）

## UI サーフェス

なし（表示ロジックは変わらない）

## LLM 連携

なし（プロンプト変更なし）

## 受け入れ条件

1. マイグレーションファイルが `supabase/migrations/` に存在し、`RENAME COLUMN content_md_ja TO content_md` を含む
2. `lib/llm/pipeline.ts` の upsert で `content_md: finalNarrative` を使っている
3. `lib/db/queries/matches.ts` の `content_md_ja` 参照がすべて `content_md` に更新されている
4. `grep -r "content_md_ja" --include="*.ts" --include="*.tsx" lib/` の出力が 0 件
5. `tsc --noEmit` でビルドエラーなし
6. 既存の `getRecentlyReviewedMatches` が `language = 'ja'` のコンテンツを正しく取得できる（動作変更なし）

## 未解決の質問

- `lib/db/types.ts` が自動生成ファイルか手書きファイルかを確認し、
  自動生成の場合は `supabase gen types` を再実行するか、
  手書きの場合は直接 `content_md_ja → content_md` を修正する
- `content_md_ja` を参照しているファイルが `lib/` 以外にもあるか
  （`grep -r "content_md_ja" .` で全件洗い出してから実装すること）
