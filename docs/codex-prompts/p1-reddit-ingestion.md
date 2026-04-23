# Codex プロンプト: p1-reddit-ingestion

以下の内容をそのまま Codex にコピペして使用します。

---

`/specs/p1-reddit-ingestion.md` の仕様を実装してください。

## コンテキスト

- プロジェクト規約は `AGENTS.md` を必ず最初に読む（特に「設計の不変条件」のスクレイピング関連、「著作権への配慮」）
- システム設計は `/docs/architecture.md`、過去の判断は `/docs/decisions.md` を読む
- 前提となる基盤:
  - `p0-foundation.md` — Next.js / Supabase / Claude API / Vitest のセットアップ
  - `p1-data-model.md` — `match_raw_data` スキーマ
  - `p1-scraping-infra.md` — `lib/scrapers/` の `fetchWithPolicy` / `saveRawData`
  - `p1-match-ingestion.md` — `lib/cron/auth.ts` と cron エンドポイントのパターン
  - `p1-data-retention.md` — 7 日クリーンアップ cron（本 PR で保存する raw data は 7 日後に削除される前提）
- 既存の `lib/env.ts`、`lib/db/server.ts`、`lib/scrapers/*.ts`、`lib/cron/auth.ts`、`app/api/cron/ingest-fixtures/route.ts`、`tests/scrapers/`、`tests/api/` のパターンを厳密に踏襲する

## 範囲の再確認（重要）

- **r/rugbyunion の match thread / post-match thread の発見 + 生 JSON 保存のみ**
- フィルタ・スコアリング・日本語要約は `p1-content-pipeline.md` 段階 3 の責務で、本 PR では一切実装しない
- `specs/p1-reddit-ingestion.md`「対象外」セクションの項目を絶対に実装しない
- Reddit SDK（`snoowrap` 等）の追加禁止。`fetchWithPolicy` 経由で標準 `fetch` のみを使う
- ユーザー認証付き Reddit（script type / password flow）は実装しない。client_credentials のみ
- HTML スクレイピング禁止。必ず `oauth.reddit.com` の JSON API を使う

## 実装前のアクション（Owner に確認するアクション）

1. **Owner が Reddit app を登録済みか確認**。未登録の場合は実装を停止し、Owner に以下を依頼:
   - https://www.reddit.com/prefs/apps で「web app」または「installed app」として新規登録
   - `client_id` と `client_secret` を取得
   - `.env.local` に `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` を設定
   - `SCRAPER_USER_AGENT` を Reddit ToS 準拠の文字列に更新（例: `platform:tryline:v1 (by /u/<owner-username>)`）
2. `lib/cron/auth.ts` の `assertCronAuthorized` の既存シグネチャを確認し、本 PR でも再利用
3. `lib/scrapers/fetchWithPolicy` の既存オプション（`headers`, `skipRobotsCheck`）を確認。Reddit OAuth エンドポイントには `skipRobotsCheck: false`（デフォルト）で robots.txt を尊重する

## 要件

- 仕様書「モジュール構成」に従いファイルを配置（`lib/reddit/`、`lib/ingestion/sources/reddit-rugbyunion.ts`、`app/api/cron/ingest-reddit/route.ts`）
- 仕様書「OAuth2 トークン管理」のとおり、トークンを in-memory キャッシュする。キャッシュ TTL は `expires_in` の 90%（`expires_in` が 3600 なら 3240 秒）
- 仕様書「検索仕様」のとおり、`title:` フィルタと time window + score 下限で候補を絞る
- 仕様書「payload 構造」の shape に Reddit 生レスポンスを正規化してから保存する。Reddit API の生 JSON をそのまま `payload` に入れない（サイズ削減 + 下流仕様の安定化）
- 仕様書「API サーフェス」のとおり cron エンドポイントを実装。並列度 1 で直列処理（Reddit rate limit 対策）
- 仕様書「テスト戦略」の単体テスト 5 本を実装。**全て Reddit API へのリクエストをモックする**（`undici` の `MockAgent` または `vi.fn()` で fetch 差し替え）
- `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` を `.env.example` と `lib/env.ts` に追加。zod 必須バリデーション
- 疑義があれば推測せず Owner に質問

## 成果物の定義

- `pnpm supabase start` + `pnpm dev` 起動 + `.env.local` に Reddit 認証情報セット後:
  ```bash
  curl -X POST http://localhost:3000/api/cron/ingest-reddit \
    -H "Authorization: Bearer <CRON_SECRET>"
  ```
  が 200 と仕様書「API サーフェス」の JSON shape を返す
- Six Nations 2027 は 2026-04 時点で試合が未実施のため、実運用検証は Six Nations 他の直近試合 or 任意の r/rugbyunion 最新マッチスレッドでトライアルし、Owner に報告する
- `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン
- 受け入れ条件 12 項目をすべて満たす

## 完了時に必ず報告すること

- 追加・変更したファイルの一覧と役割の 1 行要約
- `.env.example` の差分
- トライアルで叩いた実際の Reddit スレッド URL（1〜2 件）と保存された `match_raw_data` の件数
- OAuth トークン取得が成功するか（401 になる場合は Owner の Reddit app 設定を再確認する指示）
- 仕様書からの意図的な逸脱があれば、逸脱内容と理由
- `pnpm lint` / `pnpm typecheck` / `pnpm test` の実行結果
- Owner 向けの未解決質問があれば列挙

## やってはいけないこと

- Reddit への書き込み操作（コメント投稿・投票・crosspost 等）
- HTML スクレイピング（old.reddit.com / www.reddit.com の HTML 直接 parse）
- Reddit API の生 JSON をそのまま `match_raw_data.payload` に保存（必ず正規化する）
- `match_raw_data` への upsert / 重複防止ロジック追加（`p1-scraping-infra.md` の「重複 insert 許容」方針に従う）
- Reddit SDK（`snoowrap` / `node-reddit-client` 等）の追加
- `vercel.json` の追加（Vercel 連携は対象外）
- `match_raw_data` / `matches` / `competitions` 等のスキーマ変更
- `lib/scrapers/` の共通基盤を迂回した直接 `fetch()` 呼び出し
- `REDDIT_CLIENT_SECRET` をログ・レスポンス・エラーメッセージに出力（`console.log(env)` 等で全エクスポートしない）
- `CLAUDE.md` / `AGENTS.md` / `/specs/*.md` / `/docs/decisions.md` の書き換え（矛盾を見つけたら Owner に報告）
- 実ネットワーク（Reddit API）を叩くテスト
- r/rugbyunion 以外のサブレディットへの拡張実装
- ユーザー認証付き Reddit（password grant / refresh token flow）の実装
- 管理画面 UI や再取り込みボタンの追加
