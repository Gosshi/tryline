# Codex プロンプト: p1-observability

以下の内容をそのまま Codex にコピペして使用します。

---

`/specs/p1-observability.md` の仕様を実装してください。

## コンテキスト

- プロジェクト規約は `CLAUDE.md` を必ず最初に読む
- 過去の判断は `/docs/decisions.md` を読む（特に D010: コストアラート閾値 $0.20）
- 前提となる基盤:
  - `p1-content-pipeline.md` — `lib/llm/pipeline.ts` / `lib/llm/notify.ts` / `lib/llm/types.ts` が実装済み
  - `lib/env.ts` — 環境変数バリデーション済み
- 既存の `lib/llm/pipeline.ts` / `lib/llm/notify.ts` / `tests/llm/pipeline.test.ts` を必ず読んでから着手すること

## 範囲の再確認（重要）

- **`lib/llm/notify.ts` と `lib/llm/pipeline.ts` の変更、および `lib/env.ts` への env var 追加のみ**
- Sentry 連携は対象外（npm レジストリ制約のため）
- 新規 npm パッケージを追加しない（`fetch` を使用）
- `pipeline_runs` テーブルのスキーマ変更なし
- Slack チャンネル設定・管理 UI は対象外

## 実装前のアクション

1. `lib/llm/notify.ts` の現在のシグネチャを確認する
2. `lib/llm/pipeline.ts` の `notifyContentRejected` 呼び出し箇所（`persistedStatus === "draft"` の後）を確認する
3. `lib/llm/types.ts` の `QaResult` 型を確認する
4. `tests/llm/pipeline.test.ts` で `notifyContentRejected` がどのようにモックされているかを確認する

## 要件

### `lib/env.ts`
- `serverEnvSchema` に `SLACK_WEBHOOK_URL: z.string().url().optional()` を追加
- `.env.example` に `SLACK_WEBHOOK_URL=` をコメント付きで追記

### `lib/llm/notify.ts`
- 仕様書「`lib/llm/notify.ts` の変更」セクションに従い実装
- `notifyContentRejected` のシグネチャを `(matchId, contentType, qaResult: QaResult)` に変更
- `notifyCostAlert` を新規追加
- `SLACK_WEBHOOK_URL` が未設定の場合は `console.warn` のみ出力して `return`
- Slack `fetch` 失敗時は `console.error` のみ。例外を re-throw しない

### `lib/llm/pipeline.ts`
- `let totalCostUsd = 0` を追加し、段階 2・3・4 の `calculateCostUsd()` 戻り値を都度加算する（リトライ時も加算）
- `notifyContentRejected(matchId, contentType)` → `notifyContentRejected(matchId, contentType, finalQa)` に変更
- upsert 完了後に `totalCostUsd > 0.20` なら `notifyCostAlert` を呼び出す
- 閾値定数 `COST_ALERT_THRESHOLD_USD = 0.20` をファイル内に定義する

### `tests/llm/notify.test.ts`（新規）
- 仕様書「受け入れ条件」のテストケースを実装
- `fetch` は `vi.fn()` でモック（実 Slack を叩かない）
- `getServerEnv` を `vi.mock` して `SLACK_WEBHOOK_URL` の有無を制御する

### `tests/llm/pipeline.test.ts`（既存、更新）
- `notifyContentRejected` のモックを新シグネチャ（3 引数）に更新する

## 成果物の定義

- `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン
- 受け入れ条件 11 項目をすべて満たす
- `SLACK_WEBHOOK_URL` 未設定でも全テストが通る

## 完了時に必ず報告すること

- 追加・変更したファイルの一覧と役割の 1 行要約
- `notifyContentRejected` の新旧シグネチャの差分
- `pnpm lint` / `pnpm typecheck` / `pnpm test` の実行結果
- Owner 向けの未解決質問があれば列挙

## やってはいけないこと

- `@sentry/nextjs` 等の npm パッケージ追加
- `pipeline_runs` テーブルのスキーマ変更
- `COST_ALERT_THRESHOLD_USD` を env var 化（定数で十分）
- Slack `fetch` 失敗時に例外を re-throw する
- `CLAUDE.md` / `/specs/*.md` / `/docs/decisions.md` の書き換え
- 実 Slack webhook を叩くテスト
