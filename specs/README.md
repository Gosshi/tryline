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

Phase 1 — Rugby Championship 2026 ローンチ（2026年 8 月）に向けた MVP 構築

## 仕様書一覧

- `p0-foundation.md` — Next.js + Supabase + Claude API の実装基盤セットアップ
- `p1-data-model.md` — 試合中心のコアデータモデル（スキーマ + RLS）
- `p1-scraping-infra.md` — 全スクレイパー共通の robots / レート制限 / fetcher 基盤
- `p1-match-ingestion.md` — Rugby Championship 2026 の fixtures / results 取り込み
- `p1-content-pipeline.md` — 試合ごとのプレビュー／レビュー 5 段階生成パイプライン
