---
name: prod-investigation
description: 本番 Supabase のデータ調査・デバッグをするときに使う。「本番のデータを見て」「DB を調べて」「なぜこの試合の recap がないか」等の調査で起動。読み取り専用の作法と主要テーブルの入口。
---

# 本番データ調査（読み取り専用）

## 鉄則

- **SELECT のみ**。`INSERT` / `UPDATE` / `DELETE` / DDL は Owner の明示承認なしに実行しない（CLAUDE.md 遵守）
- Supabase MCP の `execute_sql` を使う（ToolSearch で先にロード）。プロジェクトは `list_projects` で確認してから
- 修正が必要と判明したら、直接直さず原因と方針を報告 → spec 化 → Codex 委譲の流れに乗せる

## スキーマの入口

- 型定義: `lib/db/types.ts`（テーブル・カラムの正）
- クエリパターン: `lib/db/queries/` 配下
- マイグレーション履歴: `supabase/migrations/`

## よくある調査パターン

- **コンテンツ欠落**: match に対する preview/recap の有無と status（published / draft）を確認。draft 落ちは QA 不合格が典型
- **イベント欠落・汚染**: match_events の件数と event 共有を確認（過去に 35 recap が別試合データを参照した汚染事故あり。spec: `specs/fix-contaminated-match-events.md`）
- **URC / SRP**: この 2 大会は events が薄い既知ギャップがある（spec: `specs/feat-urc-srp-match-events.md`）
- **MOM**: recap の MOM は LLM 推論であり公式と食い違うことがある

## 調査結果の報告

「事実（SQL と結果件数）→ 原因仮説 → 対処方針（spec 候補 or 手修正提案）」の順で報告し、対処の実行判断は Owner に委ねる。
