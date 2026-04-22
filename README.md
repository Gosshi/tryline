# tryline

海外ラグビーリーグを観戦する日本のファン向け、日本語の AI コンパニオン。

## プロダクト概要

公開情報から試合データを集約し、LLM で日本語のプレビュー・レビューを生成し、試合ごとの AI チャットを提供します。DAZN、J SPORTS、WOWOW で国際試合を観戦している日本のラグビーファン向け。

## ステータス

pre-alpha、プライベート開発中。ローンチ目標: Rugby Championship 2026（2026年8月）。スケール目標: Rugby World Cup 2027（2027年10〜11月）。

## アーキテクチャ

4 層パイプライン:

1. **データソース** — 公開ラグビーサイト（robots.txt 準拠のスクレイパー）、Reddit の試合スレッド
2. **取り込み・ストレージ** — Supabase postgres、スケジュール実行の cron
3. **LLM 生成** — OpenAI API、試合ごとに 5 段階のコンテンツ生成パイプライン
4. **Web アプリ** — Next.js 15 PWA、試合単位のビュー、AI チャット

詳細は `/docs/architecture.md` を参照。

## 技術スタック

Next.js 15 / TypeScript / Supabase / OpenAI API / Stripe / Vercel / Tailwind / shadcn/ui

## 開発

本リポジトリは役割分担を明確にして運用します。

- `CLAUDE.md` — Claude Code のコンテキスト（設計・仕様・レビューに使用）
- `/specs` — Codex が実装する仕様書
- `/docs/decisions.md` — アーキテクチャ意思決定記録

運用モデルの詳細は `CLAUDE.md` を参照。

## ローカル環境セットアップ

```bash
pnpm install
cp .env.example .env.local
# Supabase と OpenAI API の値を記入
pnpm supabase:start
pnpm dev
```

## ライセンス

Proprietary、全権利留保。
