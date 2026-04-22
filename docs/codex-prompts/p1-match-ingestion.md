# Codex プロンプト: p1-match-ingestion

以下の内容をそのまま Codex にコピペして使用します。

---

`/specs/p1-match-ingestion.md` の仕様を実装してください。

## コンテキスト

- プロジェクト規約は `CLAUDE.md` を必ず最初に読む（特に「設計の不変条件」のスクレイピング関連）
- システム設計は `/docs/architecture.md` の「データフロー」と「スクレイピングルール」を読む
- 過去の判断は `/docs/decisions.md` を読む（特に `D006` Rugby Championship 2026 を MVP ローンチ対象に）
- 前提となる基盤:
  - `p0-foundation.md` — Next.js / Supabase / Claude API のセットアップ
  - `p1-data-model.md` — `competitions` / `teams` / `matches` / `match_raw_data` / `match_events` スキーマ
  - `p1-scraping-infra.md` — `lib/scrapers/` の共通基盤（`fetchWithPolicy` / `saveRawData` 等）
- 既存の `lib/env.ts`、`lib/db/server.ts`、`lib/scrapers/*.ts`、`tests/` のパターンを踏襲する

## 範囲の再確認（重要）

- **Rugby Championship 2026 の fixtures + results 取り込みのみ**。選手・スカッド・Reddit・他大会は対象外
- `p1-match-ingestion.md`「対象外」セクションの項目を絶対に実装しない
- `lib/scrapers/` を再発明しない。共通基盤の `fetchWithPolicy` / `saveRawData` を必ず経由する
- `match_events` は本 PR では空でも可（「パース仕様（Wikipedia）」末尾のスコープ調整参照）

## 実装前のアクション

1. Wikipedia の 2026 Rugby Championship 記事の実際のタイトル・URL・表構造を確認する（ブラウザまたは `curl`）
2. `robots.txt` が `/wiki/` 配下のクロールを許可していることを確認する
3. 「未解決の質問 1」に対し、実際の記事タイトルを Owner に報告する（実装を停止して確認を待つ）

## 要件

- 仕様書「モジュール構成」に従いファイルを配置
- 仕様書「シードデータ」の SQL を新規マイグレーション `<ts>_seed_rugby_championship_2026.sql` として追加
- 仕様書「API サーフェス」の 2 エンドポイント（`ingest-fixtures` / `ingest-results`）をそれぞれ `app/api/cron/` 配下に実装
- 仕様書「冪等性」の方針を厳守（同じ試合の重複・kickoff 変更の扱い）
- 仕様書「テスト戦略」の 3 本のテストを `tests/ingestion/` と `tests/api/` 配下に実装
- `tests/fixtures/wikipedia-rc-2026.html` として最小限の HTML サンプルを作成（実 Wikipedia の該当表のみ切り出し、`<!-- ... -->` でメモ）
- `CRON_SECRET` を `.env.example` / `lib/env.ts` に追加。必須環境変数として zod バリデーション
- `date-fns` を依存に追加（既存になければ）
- パーサーの実装方針は仕様書「パース仕様（Wikipedia）」に従う。表構造が異なる場合は実装前に Owner に報告
- 疑義があれば推測せず Owner に質問

## 成果物の定義

- `pnpm supabase db reset` 後、`competitions` / `teams` / `competition_teams` にシードが入っている
- `POST /api/cron/ingest-fixtures`（Bearer 付き）がローカルで 200 を返し、`matches` と `match_raw_data` に行が追加される
- `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン
- 受け入れ条件 11 項目をすべて満たす

## 完了時に必ず報告すること

- 追加・変更したファイルの一覧と役割の 1 行要約
- 追加した依存パッケージとバージョン
- 実際に採用した Wikipedia 記事 URL と、表構造の確認結果
- 仕様書からの意図的な逸脱があれば、逸脱内容と理由
- `pnpm lint` / `pnpm typecheck` / `pnpm test` の実行結果
- Owner 向けの未解決質問があれば列挙

## やってはいけないこと

- 選手 / スカッド / Reddit / 他大会の取り込み実装
- `vercel.json` の追加（`p0-foundation.md` で Vercel 連携は対象外）
- `lib/scrapers/` の共通基盤を迂回した直接 `fetch()` 呼び出し
- `match_events` の unique 制約追加（`p1-data-model.md` のスキーマ変更）
- `CLAUDE.md` / `/specs/*.md` / `/docs/decisions.md` の書き換え（矛盾を見つけたら Owner に報告）
- 実ネットワーク（Wikipedia）を叩くテスト
- 仕様書で指定されていない依存（`axios`、`puppeteer` 等）の追加
- 管理画面 UI や再取り込みボタンの追加
