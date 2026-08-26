`/specs/feat-news-link-digest.md` の仕様を実装してください。仕様本文は繰り返しません。着手前に必ず spec を読んでください。

## この設計が成立している理由を理解してから着手してください

海外ラグビーの主要ソースは、robots.txt か利用規約のどちらかで**自動取得を閉じています**。それでもこの spec が成立するのは、**記事本文が一度も AI に触れないから**です。

```
RSS だけ取得 → チーム名で機械フィルタ → 見出しだけ日本語化 → Discord 通知
                                          ↑ LLM が触れる唯一の箇所
```

**この境界を越える実装をしたら、設計ごと壊れます。** 以下は絶対にやらないでください。

1. **記事ページを取得すること**（RSS フィード URL のみ）
2. **本文・要約を保存すること**（`news_links` に本文カラムを作らない）
3. **本文・要約を LLM に渡すこと**（渡すのは見出し1行だけ）
4. **収集した見出しやリンクをサイトに出すこと**（RNZ の条件で明確に禁止）

## 最初に読むファイル

| ファイル | 何を確認するか |
|---|---|
| `lib/scrapers/fetcher.ts` | `fetchWithPolicy`。robots 判定とレート制限が実装済み。**必ずこれを通す** |
| `lib/llm/notify.ts` | Discord 通知の既存実装。`DISCORD_WEBHOOK_OPS` を使う |
| `lib/llm/models.ts` | モデル ID の集中管理。**直書き禁止** |
| `.github/workflows/cron-ingest-standings.yml` | cron ワークフローの形式（`curl -X POST` ＋ `CRON_SECRET`） |
| `lib/cron/auth.ts` | `assertCronAuthorized` |

## 落とし穴が3つあります

**1. `vercel.json` に cron を書かないこと**

Vercel Cron は **GET** で呼びます。`weekly-digest` はルートが `POST` しか持たないため**一度も動いていませんでした**（2026-08-26 発覚）。他17本の cron はすべて GitHub Actions から `curl -X POST` で叩いています。**同じ形式にしてください。**

**2. RLS を必ず有効にすること**

`news_links` はサイトに出さない前提です。**匿名・認証ユーザーから読み取れてはいけません。** 過去に `weekly_news_items` で RLS 無効のまま本番に出た事故があります（`feedback_new_table_rls_verification`）。

**3. フィルタに LLM を使わないこと**

チーム名の一致判定は単純な文字列照合で足ります。ここで LLM を使うとコストが跳ね、精度も上がりません。**LLM は見出しの日本語化だけ**です。

## 翻訳失敗で止めないでください

見出しの日本語化に失敗しても、**原文のまま通知してください**。翻訳できないことより、情報が届かないことの方が損失が大きいです。

## 通知フォーマットは後続 spec の前提になります

Discord bot による事実入力（別 spec）が、**この通知メッセージから試合を特定します**。`matched_match_id` を機械的に取り出せる形にしてください。

**確定したフォーマットを PR 本文に明記してください。** 後続の実装がこれに依存します。

## 完了の定義

spec の「受け入れ条件」14項目をすべて満たすこと。特に:

- HTTP リクエストがフィード URL に限られることをテストで確認
- `news_links` に本文・要約を格納するカラムが**無い**
- `grep -rn "skipRobotsCheck"` が新規コードで **0件**
- `vercel.json` に差分が**無い**
- `scripts/import-news-digest-facts.ts` と `lib/llm/sourced-facts/allowlist.ts` に差分が**無い**
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` が clean

## PR 本文に必ず含めること

- **確定した Discord 通知フォーマット**（後続 spec の前提）
- 実際に RSS を取得して該当判定した結果（何件取得し、何件が試合に紐付いたか）
- `news_links` の RLS ポリシーの内容
- マイグレーションファイルのパス（**マージ前に本番適用が必要**。`feedback_migration_before_merge` を参照）
- `git diff --stat`
