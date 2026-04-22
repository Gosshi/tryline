# Codex プロンプト: p1-data-model

以下の内容をそのまま Codex にコピペして使用します。

---

`/specs/p1-data-model.md` の仕様を実装してください。

## コンテキスト

- プロジェクト規約は `CLAUDE.md` を必ず最初に読む
- システム設計は `/docs/architecture.md` を読む
- 過去の判断は `/docs/decisions.md` を読む（特に `D002` Supabase、`D004` 試合中心モデル）
- 前提となる基盤は `p0-foundation.md` で完了済み。既存の `supabase/config.toml`、`lib/db/client.ts`、`lib/db/server.ts`、`lib/env.ts` のパターンを踏襲する
- 関連する既存仕様書 `/specs/p1-content-pipeline.md` で `match_content` と `pipeline_runs` テーブルが別途定義されているため、本 PR では **再定義しない**

## 範囲の再確認（重要）

- **スキーマ定義のみ**。UI、API、スクレイパー、LLM 呼び出し、シードデータ投入は対象外
- `CLAUDE.md` の「Claude Code は実装を書かない／Codex が実装する」規約は Codex（あなた）に関係なし。Codex として仕様書通りに実装してよい
- `p1-data-model.md`「対象外」セクションの項目を絶対に実装しない

## 要件

- 仕様書「データモデル変更」セクションに記載された 9 テーブル＋インデックス＋RLS ポリシー＋`updated_at` トリガーを実装
- マイグレーションは `supabase migration new <name>` で生成し、仕様書「マイグレーションファイル構成」に従って分割
- 既存の空 `supabase/migrations/` に追加する形で配置
- RLS ポリシーは仕様書「RLS ポリシー」セクションの方針（公開読み取り / 非公開 / ユーザースコープ）に厳密に従う
- `auth.users` → `public.users` の自動生成トリガーを含める
- マイグレーション適用後に `pnpm supabase:types` で `lib/db/types.ts` を再生成し、成果物をコミットする
- 受け入れ条件の「マイグレーションのテスト（最低 3 本）」を `tests/db/` 配下に実装（Vitest）
- `/api/health` の Supabase チェックを `competitions` テーブルへの `select count(*)` に更新
- 疑義があれば推測せず Owner に質問

## 成果物の定義

- `pnpm supabase db reset` がエラーなく完走する
- `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン
- `/api/health` が新しい Supabase チェックで 200 を返す
- `lib/db/types.ts` に新規 9 テーブルの型が含まれている
- 受け入れ条件 13 項目をすべて満たす

## 完了時に必ず報告すること

- 追加／変更したマイグレーションファイルの一覧
- 追加したテストの一覧と、各テストが検証している受け入れ条件番号
- `pnpm supabase:types` の実行結果（`lib/db/types.ts` の diff 概要）
- 仕様書からの意図的な逸脱があれば、逸脱内容と理由
- `pnpm supabase db reset` / `pnpm lint` / `pnpm typecheck` / `pnpm test` の実行結果
- 実装中に発覚した仕様の曖昧さや Owner 向けの質問

## やってはいけないこと

- `match_content` や `pipeline_runs` の再定義（`p1-content-pipeline.md` 側のスコープ）
- スクレイパー、LLM 呼び出し、UI、認証 UI、Stripe の実装
- シードデータの投入（別仕様書 `p1-match-ingestion.md` で実施予定）
- `auth.users` スキーマの変更
- `CLAUDE.md` / `/specs/*.md` / `/docs/decisions.md` の書き換え（矛盾を見つけたら Owner に報告）
- 仕様書で指定されていない新規テーブル・カラムの追加
- `p0-foundation.md` で確定した技術選定外のパッケージ追加
