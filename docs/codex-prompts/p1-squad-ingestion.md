# Codex プロンプト: p1-squad-ingestion

以下の内容をそのまま Codex にコピペして使用します。

---

`/specs/p1-squad-ingestion.md` の仕様を実装してください。

## コンテキスト

- プロジェクト規約は `CLAUDE.md` を必ず最初に読む（特に「設計の不変条件」の robots.txt / レート制限 / キャッシュの項）
- システム設計は `/docs/architecture.md` の「スクレイピングルール」と「データフロー」を読む
- 過去の判断は `/docs/decisions.md` を読む（特に `D007` Six Nations 2027 を MVP ローンチ対象に、`D008` OpenAI モデル選定）
- 前提となる基盤:
  - `p0-foundation.md` — Next.js / Supabase / OpenAI API のセットアップ
  - `p1-data-model.md` — `teams` / `players` / `matches` スキーマ（`players` テーブルは定義済みだが空）
  - `p1-scraping-infra.md` — `lib/scrapers/` の共通基盤（`fetchWithPolicy` / `saveRawData` 等）
  - `p1-content-pipeline.md` — `lib/llm/stages/assemble.ts` / `lib/llm/types.ts` のパターン
- 既存の `lib/scrapers/*.ts`、`lib/llm/stages/assemble.ts`、`lib/llm/types.ts`、`lib/env.ts`、`tests/` のパターンを踏襲する

## 範囲の再確認（重要）

- **Wikipedia からのスカッド・ラインアップ取り込みと `assemble.ts` の更新のみ**。協会公式サイト / ESPN Scrum / 故障情報 / AI チャット / C1 スケジューリングは対象外
- `p1-squad-ingestion.md`「対象外」セクションの項目を絶対に実装しない
- `lib/scrapers/` を再発明しない。`fetchWithPolicy` を必ず経由する
- `injuries` フィールドは手を付けない（`{ home: [], away: [] }` のまま維持）

## 実装前のアクション（着手前に必ず確認）

1. `WIKIPEDIA_SQUAD_URL` 環境変数のデフォルト値として使う 2025 Six Nations スカッドページ URL を特定する。Wikipedia で `2025_Six_Nations_Championship` を検索し、スカッドテーブルが存在するページ URL を確認。存在しない / 構造が大きく異なる場合は実装前に Owner に報告
2. Wikipedia の `en.wikipedia.org` に対し `robots.txt` を確認（`/wiki/` パスが User-Agent `*` に対して許可されていることを確認）
3. `lib/llm/types.ts` の `AssembledContentInput.projected_lineups` 型が `string[]` のままであることを確認してから変更に着手する。既に変更されていた場合は Owner に報告
4. `.env.example` に `WIKIPEDIA_SQUAD_URL` が既に追加されていないことを確認

## 要件

### スクレイパー
- `lib/scrapers/wikipedia-squads.ts` を新規作成（仕様書「スクレイパー」セクション参照）
- `lib/scrapers/wikipedia-lineups.ts` を新規作成（仕様書「スクレイパー」セクション参照）
- `cheerio` で `.wikitable` のスカッドテーブルをパース。ページにテーブルが存在しない場合は空配列を返す（エラーにしない）
- `lib/scrapers/index.ts` から両スクレイパーをエクスポートする

### cron エンドポイント
- `app/api/cron/ingest-squads/route.ts` を新規作成（`POST` のみ）
- `app/api/cron/ingest-lineups/route.ts` を新規作成（`POST` のみ、クエリパラメータ `match_id` を受け取る）
- 認証は既存 cron と同方式: `Authorization: Bearer ${CRON_SECRET}` ヘッダーを検証

### データモデル
- `match_lineups` テーブルを追加するマイグレーションを `supabase/migrations/` に作成（仕様書「データモデル変更」の DDL を使用）
- RLS ポリシーも同マイグレーションに含める（select: anon + authenticated、write: service_role のみ）

### 型・`assemble.ts` の更新
- `lib/llm/types.ts` の `AssembledContentInput.projected_lineups` 型を仕様書「データモデル変更」の型定義に変更する
- `lib/llm/stages/assemble.ts` を仕様書「`assemble.ts` の変更」のフォールバック 3 段階で実装する
- 既存テストのモック（`AssembledContentInput` を参照している箇所）を新型に合わせて更新する

### 環境変数
- `WIKIPEDIA_SQUAD_URL` を `lib/env.ts` の zod バリデーションに追加（必須、URL 形式）
- `.env.example` にコメント付きで追記:
  ```
  # Wikipedia Six Nations squad page URL
  # 2027大会ページが公開されるまでは2025年版等でテストする
  # e.g. https://en.wikipedia.org/wiki/2025_Six_Nations_Championship
  WIKIPEDIA_SQUAD_URL=
  ```

### テスト
- `tests/scrapers/wikipedia-squads.test.ts` — スカッドパーサーの単体テスト（HTML モック使用）
- `tests/scrapers/wikipedia-lineups.test.ts` — ラインアップパーサーの単体テスト（HTML モック使用）
- `tests/api/ingest-squads.test.ts` — エンドポイントの認証・upsert フローをテスト
- `tests/api/ingest-lineups.test.ts` — エンドポイントの認証・フォールバック（`null` 返却）・players insert をテスト
- `tests/llm/stages/assemble.test.ts` — 既存テストを更新し、フォールバック 3 段階（match_lineups あり / players のみ / 両方空）をテスト
- 実ネットワーク（Wikipedia）を叩くテストは一切作らない

## 成果物の定義

- `pnpm supabase db reset` 後、`match_lineups` テーブルが存在し RLS が有効になっている
- `POST /api/cron/ingest-squads`（Bearer 付き）がローカルで 200 を返す
- `POST /api/cron/ingest-lineups?match_id=<uuid>`（Bearer 付き）でラインアップ未登録試合に 200 + `{ "announced": false }` が返る
- `assemble.ts` が `match_lineups` / `players` / 空配列の 3 段階フォールバックで動作する
- `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン
- 受け入れ条件 12 項目をすべて満たす

## 完了時に必ず報告すること

- 追加・変更したファイルの一覧と役割の 1 行要約
- 追加した依存パッケージとバージョン（`cheerio` が既存でない場合）
- テスト用に採用した Wikipedia ページ URL と、テーブル構造の確認結果
- 仕様書からの意図的な逸脱があれば、逸脱内容と理由
- `pnpm lint` / `pnpm typecheck` / `pnpm test` の実行結果
- Owner 向けの未解決質問があれば列挙

## やってはいけないこと

- 協会公式サイト（england-rugby.org 等）/ ESPN Scrum / RugbyPass のスクレイパー実装
- 故障情報（`injuries`）の取り込み実装
- C1 スケジューリング（`vercel.json` への cron 設定追加）
- `lib/scrapers/` の共通基盤を迂回した直接 `fetch()` 呼び出し
- `lib/llm/prompts/` のプロンプトテンプレート変更（型変更の恩恵は自動で伝わる）
- `CLAUDE.md` / `/specs/*.md` / `/docs/decisions.md` の書き換え（矛盾を見つけたら Owner に報告）
- 実ネットワーク（Wikipedia）を叩くテスト
- 仕様書で指定されていない依存（`axios`、`puppeteer`、`playwright` 等）の追加
- 管理画面 UI や手動再取り込みボタンの追加
- `injuries` フィールドへの変更（空配列維持が要件）
