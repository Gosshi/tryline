# Codex プロンプト: p1-pipeline-scheduling

以下の内容をそのまま Codex にコピペして使用します。

---

`/specs/p1-pipeline-scheduling.md` の仕様を実装してください。

## コンテキスト

- プロジェクト規約は `CLAUDE.md` を必ず最初に読む
- システム設計は `/docs/architecture.md` を読む
- 過去の判断は `/docs/decisions.md` を読む（特に D010: T-48h プレビュー / T+1h レビューのタイミング）
- 前提となる基盤:
  - `p1-content-pipeline.md` — `generateMatchContent()` が `lib/llm/pipeline.ts` に実装済み
  - `p1-squad-ingestion.md` — `ingest-lineups` エンドポイントが実装済み
  - `p1-match-ingestion.md` — `ingest-fixtures` / `ingest-results` エンドポイントが実装済み
  - `p1-data-retention.md` — `cleanup-raw-data` エンドポイントが実装済み
  - `lib/cron/auth.ts` — `assertCronAuthorized` が実装済み
- 既存の `app/api/cron/*/route.ts` と `tests/api/*.test.ts` のパターンを踏襲する

## 範囲の再確認（重要）

- **`vercel.json` の追加と `orchestrate` エンドポイントの新規作成のみ**
- 既存の `ingest-fixtures` / `ingest-results` / `ingest-squads` / `cleanup-raw-data` の本体は変更しない
- Slack 通知の実体実装は対象外（`notifyContentRejected` は stub のまま）
- 管理画面 UI やバックフィルスクリプトは対象外
- LLM の呼び出しロジック自体は変更しない

## 実装前のアクション

1. `lib/llm/pipeline.ts` の `generateMatchContent` のシグネチャを確認する
2. `app/api/cron/ingest-lineups/route.ts` のシグネチャを確認し、`orchestrate` から内部で再利用できるロジック（`lib/cron/orchestrate.ts` 経由）を特定する
3. Vercel Cron の仕様: リクエストは Vercel インフラから `Authorization: Bearer ${CRON_SECRET}` ヘッダー付きで送られる。既存の `assertCronAuthorized` がそのまま使える

## 要件

### `vercel.json`
- リポジトリルートに新規作成
- 仕様書「vercel.json」セクションの 5 エンドポイントを記述

### `lib/cron/orchestrate.ts`（新規）
- 仕様書「API サーフェス」に記載した DB クエリロジックを実装
- `runOrchestrate(deps)` 関数をエクスポート（deps で DI）
- Step 1（プレビュー）と Step 2（レビュー）の対象試合クエリは仕様書 SQL を厳密に実装
- 個別試合エラーは `console.error` で記録し、処理を継続する

### `app/api/cron/orchestrate/route.ts`（新規）
- `assertCronAuthorized` で認証
- `runOrchestrate` を呼び出して結果を返す
- 常に 200 を返す（個別エラー時も）

### `tests/cron/orchestrate.test.ts`（新規）
- 仕様書「受け入れ条件」のテストケース 5 つを実装
- Supabase クライアントと `generateMatchContent` / `ingestLineups` は `vi.fn()` でモック
- 実 DB・実 LLM を叩かない

## 成果物の定義

- `vercel.json` がリポジトリルートに存在し、5 cron が定義されている
- `POST /api/cron/orchestrate`（Bearer 付き）がローカルで 200 を返す
- `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン
- 受け入れ条件 11 項目をすべて満たす

## 完了時に必ず報告すること

- 追加・変更したファイルの一覧と役割の 1 行要約
- `generateMatchContent` と `ingest-lineups` ロジックの再利用方法（HTTP 呼び出し vs 関数呼び出し）
- 仕様書からの意図的な逸脱があれば、逸脱内容と理由
- `pnpm lint` / `pnpm typecheck` / `pnpm test` の実行結果
- Owner 向けの未解決質問があれば列挙

## やってはいけないこと

- 既存 cron エンドポイント本体の変更
- `notifyContentRejected` の Slack 実装
- `vercel.json` 以外の Vercel 設定ファイル追加（`vercel.json` のみ）
- バックフィル UI やスクリプトの実装
- 実 DB・実 LLM・実ネットワークを叩くテスト
- `CLAUDE.md` / `/specs/*.md` / `/docs/decisions.md` の書き換え
- Step 2（レビュー）の並列実行（コスト制御のため順次実行）
