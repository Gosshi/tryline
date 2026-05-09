# feat: family 指定でレビューを一括生成するスクリプト

## 背景

`regenerate-overseas-content.ts` は既存の `match_content` レコードを再生成するスクリプトだが、
新規インポートした試合（`match_content` レコードが存在しない）には機能しない。

`app/api/cron/orchestrate` は全大会の未生成試合を対象にするため、
特定の family（例: `six-nations`）だけを対象にした初回レビュー生成ができない。

このスクリプトは `--family` 指定で対象を絞り、初回 recap を生成する。

---

## 作成するファイル

### `scripts/generate-recaps.ts`

#### 引数

| 引数 | 必須 | 説明 |
|------|------|------|
| `--family=<slug>` | 必須 | 対象の competition family（例: `six-nations`, `premiership`） |
| `--limit=<n>` | 任意 | 最大生成件数（デフォルト: 10） |
| `--dry-run` | 任意 | 生成せずに対象試合数だけ表示 |

#### 処理フロー

1. `--family` 引数をパース。未指定なら usage を表示して終了
2. Supabase から以下を取得：
   - `matches` テーブルを `status = 'finished'` かつ `competitions.family = <family>` でフィルタ
   - `match_content` テーブルを `content_type = 'recap'` かつ `status IN ('draft', 'published')` でフィルタ
3. 両者の差分（`match_content` に存在しない match_id）を候補とする
4. 候補を `--limit` 件に絞る
5. `--dry-run` の場合は件数だけ表示して終了
6. 各 match_id に対して `generateMatchContent(matchId, "recap")` を順次呼び出す
7. 完了後に `generated=N failed=M` をコンソール出力

#### 実装上の注意

- `generateMatchContent` は `@/lib/llm/pipeline` からインポート
- Supabase クライアントは `getSupabaseServerClient()` を使用
- match を `competitions` テーブルと JOIN して family でフィルタする際は、
  `matches` の `competition_id` → `competitions.family` の参照を使う
- join の書き方（参考として `regenerate-overseas-content.ts` の `getRegenerationCandidates` を参照）：
  ```typescript
  .from("matches")
  .select(`id, competition:competitions!matches_competition_id_fkey(family)`)
  .eq("status", "finished")
  ```
- `match_content` の取得は全件取得（IN 句は使わない。`orchestrate.ts` の既存実装を参照）
- 並列処理は**しない**。順次処理（`for...of`）でレート超過を防ぐ
- エラーが発生した試合はスキップしてログ出力し、次の試合に進む

---

## 実行例

```bash
# dry-run で確認
set -a; source .env.production.local; set +a; pnpm tsx scripts/generate-recaps.ts --family=six-nations --dry-run

# Six Nations 2026 の未生成試合を最大 15 件生成
set -a; source .env.production.local; set +a; pnpm tsx scripts/generate-recaps.ts --family=six-nations --limit=15
```

---

## 変更しないこと

- `lib/cron/orchestrate.ts`
- `app/api/cron/orchestrate/route.ts`
- `regenerate-overseas-content.ts`

---

## 完了条件

- [ ] `--family` 未指定時に usage を表示して終了する
- [ ] `--dry-run` で対象件数が表示される（生成は行われない）
- [ ] `--family=six-nations` で Six Nations の未生成試合のみが対象になる
- [ ] 生成完了後に `generated=N failed=M` が表示される
- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス
