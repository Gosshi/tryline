# Codex プロンプト: p1-data-retention

以下の内容をそのまま Codex にコピペして使用します。

---

`/specs/p1-data-retention.md` の仕様を実装してください。

## コンテキスト

- プロジェクト規約は `AGENTS.md` を必ず最初に読む（特に「セキュリティ最優先ルール」と「設計の不変条件」）
- システム設計は `/docs/architecture.md`、過去の判断は `/docs/decisions.md` を読む
- 前提となる基盤:
  - `p0-foundation.md` — Next.js / Supabase / Claude API / Vitest のセットアップ
  - `p1-data-model.md` — `match_raw_data.expires_at` のスキーマ（デフォルト `now() + interval '7 days'`）
  - `p1-scraping-infra.md` — `saveRawData` の insert 方針（重複許容、履歴を残す）
  - `p1-match-ingestion.md` — `CRON_SECRET` と `lib/cron/auth.ts` の既存パターン
- 既存の `lib/cron/auth.ts`、`lib/db/server.ts`、`app/api/cron/ingest-fixtures/route.ts`、`app/api/cron/ingest-results/route.ts`、`tests/api/` のパターンを厳密に踏襲する

## 範囲の再確認（重要）

- **`match_raw_data` の期限切れ行削除 cron の実装のみ**。他テーブルのクリーンアップ・soft delete・監査ログ永続化・Vercel Cron 設定は対象外
- `specs/p1-data-retention.md`「対象外」セクションの項目を絶対に実装しない
- `match_raw_data.expires_at` のスキーマ・デフォルト値を変更しない（`supabase/migrations/` への新規マイグレーション追加禁止）
- 認可ロジック（Bearer 検証）を再実装しない。既存の `lib/cron/auth.ts` の `assertCronAuthorized` を必ず使う
- service role クライアント（`lib/db/server.ts`）を使い、anon クライアント（`lib/db/client.ts`）は使わない

## 実装前のアクション

1. `lib/cron/auth.ts` の `assertCronAuthorized` のシグネチャと throw 挙動を確認
2. `app/api/cron/ingest-fixtures/route.ts` のエラーレスポンス形式（401 / 500）と合わせる
3. Supabase JS client で delete した行数を返す方法を確認（`.delete().select('id')` または `count: 'exact'` オプション）

## 要件

- 仕様書「モジュール構成」に従いファイルを配置（`app/api/cron/cleanup-raw-data/route.ts` と `lib/retention/cleanup-raw-data.ts`）
- 仕様書「API サーフェス」のとおり、`route.ts` は認可のみ担当し、削除ロジックは `lib/retention/cleanup-raw-data.ts` に分離
- 仕様書「冪等性」のとおり、連続実行しても副作用が積み上がらないことをテストで確認
- 仕様書「ログ」のとおり、成功時 `console.info`、エラー時 `console.error` のみ。永続化は行わない
- 仕様書「テスト戦略」の単体テスト 2 ファイル（`tests/retention/cleanup-raw-data.test.ts` と `tests/api/cleanup-raw-data.test.ts`）を実装
- Supabase ローカル依存のテストは、既存 `tests/ingestion/upsert.test.ts` と同じ接続方法を踏襲
- 疑義があれば推測せず Owner に質問

## 成果物の定義

- `pnpm supabase start` と `pnpm dev` 起動後:
  ```bash
  curl -X POST http://localhost:3000/api/cron/cleanup-raw-data \
    -H "Authorization: Bearer <CRON_SECRET>"
  ```
  が 200 と `{ "status": "ok", "deleted_rows": N, "duration_ms": M }` を返す
- Bearer 無しで叩くと 401 が返る
- `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン
- 受け入れ条件 11 項目をすべて満たす

## 完了時に必ず報告すること

- 追加・変更したファイルの一覧と役割の 1 行要約
- `supabase/migrations/` / `.env.example` / `lib/env.ts` / `package.json` に差分が無いことの明示
- 仕様書からの意図的な逸脱があれば、逸脱内容と理由
- `pnpm lint` / `pnpm typecheck` / `pnpm test` の実行結果
- Owner 向けの未解決質問があれば列挙
- 動作確認として実際に `curl` でエンドポイントを叩いた結果（削除件数 0 でも可）

## やってはいけないこと

- `match_raw_data` 以外のテーブルへの delete / update / insert
- `match_raw_data` のスキーマ変更・マイグレーション追加
- soft delete 列の導入
- Vercel Cron 設定（`vercel.json`）の追加
- 監査ログ用テーブルの新設
- `lib/cron/auth.ts` を迂回した独自の Bearer 検証
- anon クライアント（`lib/db/client.ts`）経由での削除
- `CLAUDE.md` / `AGENTS.md` / `/specs/*.md` / `/docs/decisions.md` の書き換え（矛盾を見つけたら Owner に報告）
- 実ネットワーク（Wikipedia / Reddit 等）を叩くテスト
- 仕様書で指定されていない依存パッケージの追加
- 管理画面 UI や再実行ボタンの追加
