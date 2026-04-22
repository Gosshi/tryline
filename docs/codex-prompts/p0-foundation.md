# Codex プロンプト: p0-foundation

以下の内容をそのまま Codex にコピペして使用します。

---

`/specs/p0-foundation.md` の仕様を実装してください。

## コンテキスト

- プロジェクト規約は `CLAUDE.md` を必ず最初に読む
- システム設計は `/docs/architecture.md` を読む
- 過去の判断は `/docs/decisions.md` を読む
- 本 PR は **基盤セットアップのみ**。ビジネスロジック（Match、LLM パイプライン、認証 UI、Stripe、スクレイパー）は含めない
- 本 PR 時点では既存コードが存在しないため、「確立されているパターンに従う」項目は無視してよい

## 範囲の再確認（重要）

- **ローカル開発環境のみ**。Vercel の設定、本番 Supabase への接続、ステージング環境構築は対象外
- `/specs/p0-foundation.md` の「対象外」セクションに挙がっているものは絶対に実装しない
- 「決定事項」セクションに Owner の最終判断が記載されているため、ここを権威ある指示として扱う

## 要件

- 仕様書「受け入れ条件」セクションの全 9 項目を満たす
- 仕様書「ディレクトリ構造」の通りにディレクトリを作成する（空ディレクトリは `.gitkeep`）
- 仕様書「技術選定」の表に挙げた技術のみを使用。`engines.node` と `.nvmrc` で Node 20 LTS を固定
- 受け入れ条件に紐づくテストを最低 1 本書く（`/lib/env.ts` の zod バリデーションのスモークテスト）
- 曖昧な箇所は推測せず、実装前に Owner に質問する

## 成果物の定義

- `pnpm install && pnpm dev` で 3000 ポートに仮トップページが表示できる
- `pnpm supabase start` でローカル Supabase が起動する
- `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン
- `GET /api/health` が 200 を返し、Supabase と Anthropic の疎通結果が JSON で返る
- `.github/workflows/ci.yml` が追加され、main への PR で上記 3 コマンドが走る
- `.env.example` が `/specs/p0-foundation.md` で要求される変数をすべて含む（既存ファイルを更新）
- `README.md` の「ローカル環境セットアップ」手順が実際にその通り動く（必要なら README を更新）

## 完了時に必ず報告すること

- 実装したファイルの一覧と役割の 1 行要約
- 仕様書からの意図的な逸脱があれば、逸脱内容と理由
- 実装中に発覚した仕様の曖昧さや Owner 向けの質問
- `pnpm lint` / `pnpm typecheck` / `pnpm test` の実行結果（ローカルで成功していること）

## やってはいけないこと

- 認証 UI、Match テーブル、LLM パイプライン、スクレイパー、Stripe、Sentry の実装
- Vercel 設定ファイル（`vercel.json`）の追加
- 本番 Supabase プロジェクトへの接続設定
- `CLAUDE.md` / `/specs/p0-foundation.md` / `/docs/decisions.md` の書き換え（矛盾を見つけたら Owner に報告）
- 仕様書で指定されていない依存パッケージの追加（必要と感じた場合は Owner に確認）
