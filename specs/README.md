# 仕様書

Codex が実装するための機能仕様書を置きます。各仕様書は権威ある文書です。Codex は仕様書に書かれた内容を実装し、推測で機能を追加しません。

## 命名規則

`<phase>-<feature-slug>.md`

例:
- `p1-match-ingestion.md`
- `p1-preview-generation.md`
- `p2-stripe-integration.md`

## ライフサイクル

1. Owner がニーズを説明
2. Claude Code がこのフォルダに仕様書ドラフトを作成
3. Owner がレビュー・承認
4. Codex が仕様書に沿って実装
5. Owner が Codex の出力をレビュー（Claude Code が補助）
6. マージされた仕様書は不変。変更は新しい仕様書として追加

## 現在のフェーズ

Phase 1 — Six Nations 2027 ローンチ（2027年 2〜3 月）に向けた MVP 構築

## 仕様書一覧

- `p0-foundation.md` — Next.js + Supabase + OpenAI API の実装基盤セットアップ
- `p1-data-model.md` — 試合中心のコアデータモデル（スキーマ + RLS）
- `p1-scraping-infra.md` — 全スクレイパー共通の robots / レート制限 / fetcher 基盤
- `p1-match-ingestion.md` — Six Nations 2027 の fixtures / results 取り込み
- `p1-match-pages.md` — 試合一覧（`/`）と試合詳細（`/matches/[id]`）の UI
- `p1-data-retention.md` — `match_raw_data` の 7 日クリーンアップ cron
- `p1-reddit-ingestion.md` — r/rugbyunion マッチスレッドの取り込み（**D009 により実装保留中**、Reddit 承認後に再開）
- `p1-content-pipeline.md` — 試合ごとのプレビュー／レビュー 4 段階生成パイプライン（D009、元は 5 段階）
