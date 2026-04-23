# Codex プロンプト: p1-match-pages

以下の内容をそのまま Codex にコピペして使用します。

---

`/specs/p1-match-pages.md` の仕様を実装してください。

## コンテキスト

- プロジェクト規約は `CLAUDE.md` を必ず最初に読む（特に「設計の不変条件」の試合中心データモデル、モバイルファースト PWA の項）
- システム設計は `/docs/architecture.md` を読む
- 過去の判断は `/docs/decisions.md` を読む（特に `D007` Six Nations 2027 を MVP ローンチ対象に）
- 前提となる基盤:
  - `p0-foundation.md` — Next.js App Router / shadcn/ui / Supabase / Vitest のセットアップ
  - `p1-data-model.md` — `matches` / `teams` / `competitions` スキーマと RLS（public read）
  - `p1-match-ingestion.md` — Six Nations 2027 の 15 試合が既に DB に入っている前提
- 既存の `lib/env.ts`、`lib/db/client.ts`、`lib/db/server.ts`、`components/ui/*.tsx`、`app/layout.tsx`、`tests/` のパターンを踏襲する
- 生成 AI コンテンツ（プレビュー・レビュー）は `p1-content-pipeline.md` で後続実装。本 PR ではプレースホルダーのみ

## 範囲の再確認（重要）

- **試合一覧 `/` と試合詳細 `/matches/[id]` の 2 ページのみ**。認証 UI・チーム個別ページ・選手ページ・AI チャットは対象外
- `specs/p1-match-pages.md`「対象外」セクションの項目を絶対に実装しない
- `teams` テーブルへのカラム追加・RLS ポリシー変更は一切行わない
- LLM 呼び出し・OpenAI API 連携は本 PR では行わない（プレースホルダーは静的文字列）
- 新規 shadcn/ui コンポーネントの追加禁止（既存の `Button` / `Card` のみで実装する）
- 日付ライブラリ（`date-fns-tz` 等）の追加禁止（`Intl.DateTimeFormat` で実装）

## 実装前のアクション

1. `supabase/migrations/*_create_rls_policies.sql` を読み、`matches` / `teams` / `competitions` に anon の select ポリシーが存在することを確認。無い場合は**実装停止し Owner に報告**（本 PR ではポリシー追加しない）
2. `pnpm dev` + ローカル Supabase で `/` を開いた時点で、試合一覧が取得できる RLS 構成になっているか確認
3. `matches.external_ids` 内の `wikipedia_round` キーが実データに存在するか、`select external_ids from matches limit 5;` で確認

## 要件

- 仕様書「モジュール構成」に従いファイルを配置（`app/` / `components/` / `lib/db/queries/` / `lib/format/`）
- 仕様書「データクエリ」の型と関数シグネチャを厳守。`lib/db/public-server.ts`（anon 前提の RSC 用クライアント）を新設し、service role クライアントと分離
- 仕様書「ページ仕様」の 2 ページを RSC として実装。クライアントコンポーネント化は必要最小限（インタラクションが必要な箇所のみ `'use client'`）
- 仕様書「コンポーネント仕様」の 5 コンポーネントを `components/` 配下に配置
- 仕様書「日時フォーマット」のとおり `Intl.DateTimeFormat` で JST 変換を実装
- 仕様書「エラー・ローディング」の `app/error.tsx` と `app/matches/[id]/not-found.tsx` を設置
- 仕様書「テスト戦略」の 3 本のテストを `tests/format/` および `tests/components/` 配下に実装
- 仕様書「モバイル対応」の Tailwind ブレークポイント指定（`sm:` / `md:`）で 360px / 1280px の両方で崩れないことを確認
- 疑義があれば推測せず Owner に質問

## 成果物の定義

- `pnpm dev` 起動後:
  - `http://localhost:3000/` で Six Nations 2027 の 15 試合が節ごとに表示される
  - 試合カードクリックで `/matches/[id]` に遷移する
  - 存在しない UUID を指定すると 404 ページが表示される
- `pnpm lint` / `pnpm typecheck` / `pnpm test` が全てグリーン
- 受け入れ条件 12 項目をすべて満たす

## 完了時に必ず報告すること

- 追加・変更したファイルの一覧と役割の 1 行要約
- 追加した依存パッケージとバージョン（`@testing-library/react` / `jsdom` 等）
- 実装したページのスクリーンショットまたは（無理なら）ルート構造の説明
- 仕様書からの意図的な逸脱があれば、逸脱内容と理由
- `pnpm lint` / `pnpm typecheck` / `pnpm test` の実行結果
- Owner 向けの未解決質問があれば列挙
- `external_ids.wikipedia_round` が全 15 試合に付与されているか（null が混在するか）

## やってはいけないこと

- 認証 UI（ログイン・サインアップ）の実装
- LLM 呼び出し・OpenAI API 連携・プレビュー／レビューの実データ生成
- `teams` / `matches` / `competitions` テーブルへのカラム追加
- `supabase/migrations/` への新規マイグレーション追加
- RLS ポリシーの追加・変更
- チーム別ページ・選手ページ・検索・フィルタの実装
- 新規 shadcn/ui コンポーネント（Dialog / Sheet / Command 等）の追加
- `date-fns-tz` / `next-intl` / `react-i18next` 等の追加依存
- OGP 画像生成・PWA manifest / service worker の実装
- `CLAUDE.md` / `/specs/*.md` / `/docs/decisions.md` の書き換え（矛盾を見つけたら Owner に報告）
- 実ネットワーク（Supabase を除く外部 API）を叩くテスト
