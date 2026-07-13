---
name: prod-investigation
description: 本番 Supabase のデータ調査・デバッグをするときに使う。「本番のデータを見て」「DB を調べて」「なぜこの試合の recap がないか」等の調査で起動。読み取り専用の作法と主要テーブルの入口。
---

# 本番データ調査（読み取り専用）

## 鉄則

- **基本は SELECT のみ**。`UPDATE` は、その都度 Owner の明示的承認を得た場合に限り Claude Code 自身が実行してよい（対象行・条件を先に提示し、実行後に影響件数を確認する）。`INSERT` / `DELETE` / DDL は承認があっても Claude Code 自身は実行しない。修正が必要な場合は Owner 自身が実行するか、Codex への実装依頼に回す
- Supabase MCP の `execute_sql` を使う（ToolSearch で先にロード）。プロジェクトは `list_projects` で確認してから
- 修正が必要と判明したら、直接直さず原因と方針を報告 → spec 化 → Codex 委譲の流れに乗せる

## 既知ギャップを鵜呑みにしない

このファイルに書かれた「既知の欠落」は起票時点の事実にすぎず、後続の実装で解消されていることが多い（2026-07-13 監査で URC/SRP 項目が実際に反証された）。調査前に、該当 spec が既にマージ済みでないか `git log --oneline -- specs/<name>.md` で確認し、書かれた既知ギャップを鵜呑みにしない。

## スキーマの入口

- 型定義: `lib/db/types.ts`（テーブル・カラムの正）
- クエリパターン: `lib/db/queries/` 配下
- マイグレーション履歴: `supabase/migrations/`

## よくある調査パターン

- **コンテンツ欠落**: match に対する preview/recap の有無と status（published / draft）を確認。draft 落ちは QA 不合格が典型
- **イベント欠落・汚染**: match_events の件数と event 共有を確認（過去に 35 recap が別試合データを参照した汚染事故あり。spec: `specs/fix-contaminated-match-events.md`）
- **URC / SRP**: 2026-06 時点では events が薄い既知ギャップがあったが、`specs/feat-urc-srp-match-events.md` 等のPRで解消済み（2026-07-13実測: URC 145/157件・SRP 160/166件の終了試合でevents保有、いずれも9割超）。現役の注意点はイベント汚染（`specs/fix-contaminated-match-events.md`）とURCノックアウトラウンドの取りこぼし
- **MOM**: recap の MOM は LLM 推論であり公式と食い違うことがある

## 調査結果の報告

「事実（SQL と結果件数）→ 原因仮説 → 対処方針（spec 候補 or 手修正提案）」の順で報告し、対処の実行判断は Owner に委ねる。
