# Codex プロンプト: p1-scraping-infra

以下の内容をそのまま Codex にコピペして使用します。

---

`/specs/p1-scraping-infra.md` の仕様を実装してください。

## コンテキスト

- プロジェクト規約は `CLAUDE.md` を必ず最初に読む（特に「設計の不変条件」の robots.txt / レート制限 / キャッシュの項）
- システム設計は `/docs/architecture.md` の「スクレイピングルール」セクションを読む
- 過去の判断は `/docs/decisions.md` を読む
- 前提となる基盤は `p0-foundation.md`、データモデルは `p1-data-model.md`（`match_raw_data` テーブル）で完了済み
- 既存の `lib/env.ts`、`lib/db/server.ts`、`lib/db/client.ts` のパターンを踏襲する
- 既存の `tests/env.test.ts`、`tests/db/` のテストスタイルを踏襲する（Vitest）

## 範囲の再確認（重要）

- **共通ユーティリティのみ**。ソース別スクレイパー、cron、API ルート、HTML パース、Reddit API クライアントは対象外
- `p1-scraping-infra.md`「対象外」セクションの項目を絶対に実装しない
- 抽象基底クラスや汎用オプションの追加禁止。`CLAUDE.md`「Three similar lines is better than a premature abstraction」に従う

## 要件

- 仕様書「モジュール構成」に従い `lib/scrapers/` 配下に 6 ファイルを作成（`robots.ts`, `rate-limit.ts`, `fetcher.ts`, `errors.ts`, `raw-data.ts`, `index.ts`）
- 仕様書「API サーフェス」セクションに記載された関数シグネチャ・挙動を厳密に実装
- 新規依存は `robots-parser` と `cheerio` のみ（`cheerio` は本 PR では未使用でも `package.json` に加える）
- `fetchWithPolicy` の処理順序（robots → rate-limit → fetch → retry）を仕様書通りに守る
- User-Agent は `lib/env.ts` から取得した `SCRAPER_USER_AGENT` を自動付与
- 受け入れ条件の全 10 項目に対応する単体テストを `tests/scrapers/` 配下に実装
- 実ネットワークを叩くテストは一切作らない（全て `vi.fn()` / `msw` / `undici` の `MockAgent` 等でモック）
- 疑義があれば推測せず Owner に質問

## 成果物の定義

- `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン
- `lib/scrapers/index.ts` から `fetchWithPolicy`, `saveRawData`, `isAllowed`, `acquireSlot`, 各エラー型がエクスポートされている
- 受け入れ条件 10 項目をすべて満たす

## 完了時に必ず報告すること

- 追加・変更したファイルの一覧と役割の 1 行要約
- 追加した依存パッケージのバージョン
- 仕様書からの意図的な逸脱があれば、逸脱内容と理由
- `pnpm lint` / `pnpm typecheck` / `pnpm test` の実行結果
- 実装中に発覚した仕様の曖昧さや Owner 向けの質問

## やってはいけないこと

- ソース別スクレイパー（Rugby Pass / ESPN / Reddit 等）の実装
- cron エンドポイントや `app/api/` 配下の追加
- 抽象基底クラス・設定システム・プラグイン機構の追加
- 実ネットワークを叩くテスト
- `axios` / `p-limit` / `node-cache` / `redis` など仕様書で除外された依存の追加
- `CLAUDE.md` / `/specs/*.md` / `/docs/decisions.md` の書き換え（矛盾を見つけたら Owner に報告）
- `lib/env.ts` や `lib/db/` の既存ファイルの大幅な書き換え（必要な追加があれば Owner に確認）
