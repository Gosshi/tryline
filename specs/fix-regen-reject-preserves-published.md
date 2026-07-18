# fix-regen-reject-preserves-published: 再生成 reject 時に既存 published を温存する

対象リポジトリ: **tryline**。優先度: **高（次回の週次リフレッシュ cron = 木曜 21:05 JST までにマージ必須）**

## 背景

2026-07-18、`cron-weekend-preview-refresh.yml`（#584）の初回実行（金曜 21:05 JST トリガー）で、日本×フランス・南ア×ウェールズの preview が再生成 → QA reject → **draft が既存 published を上書きし、試合当日の本番からプレビューが消えた**。

根本原因は `lib/llm/pipeline.ts` の永続化ブロック（約 608〜625 行）: QA verdict が reject でも `db.from("match_content").upsert(..., { onConflict: "match_id,content_type,language" })` を**無条件に実行**するため、reject 産物（status='draft'）が既存の published 行を本文ごと置き換える。旧本文はどこにも残らず復元不能（今回は draft 本文を手動検品・修正して published 復帰させた）。

2026-06-12 の再生成全件 draft 化事故（297 件消失）と同じ構造が、自動 cron によって毎週再現されうる状態。リフレッシュ系 workflow（weekend-preview-refresh / post-match-recap-refresh）は「新情報で上書きできたら儲け、失敗したら現状維持」が正しい failure mode であり、「失敗したら消える」は許容できない。

## スコープ

対象:
- `lib/llm/pipeline.ts` の match_content 永続化ブロック

対象外:
- QA 判定ロジック自体の変更（reject の妥当性・字数下限・人名照合の false positive は別issue。関連: `specs/fix-qa-player-stat-script-mismatch.md`）
- workflow yaml の変更
- 手動再生成スクリプト群のフラグ追加（pipeline 層で直すため全経路に効く）

## 変更内容

永続化前に既存行の status を確認し、次の規則で分岐する:

| 新 verdict → persistedStatus | 既存行 | 挙動 |
|---|---|---|
| published | あり/なし | 現行どおり upsert（上書き） |
| draft | **既存が published** | **upsert をスキップし published を温存**。`notifyContentRejected` は「reject されたが既存 published を温存した」ことが分かる文言で通知し、reject 産物の qa_scores・字数をログに出す（黙って握り潰さない） |
| draft | 既存が draft / rejected / 行なし | 現行どおり upsert（draft 更新は情報が新しい方が良い） |

- 既存行の取得は upsert 直前に `select status`（match_id + content_type + language）で行う。レースコンディション（同一試合の並行生成）は現行運用に存在しないため、厳密なロック・条件付き UPDATE までは要求しない（`update ... where status <> 'published'` 形式の条件付き書き込みにできるならなお良い）
- IndexNow 送信（published 時のみ）・`notifyContentRejected`（draft 時）の既存フローは維持

## 受け入れ条件

1. 既存 published + 新 verdict reject → match_content 行が**一切変更されない**（content_md・status・generated_at・qa_scores すべて。テストで前後比較）
2. 既存 published + 新 verdict publish → 現行どおり上書きされる（既存テストが通る）
3. 既存行なし + reject → 現行どおり draft が insert される
4. 既存 draft + reject → 現行どおり draft が更新される
5. 温存が発生した場合、`notifyContentRejected` 相当の通知/ログに「published 温存」の旨と reject 理由が含まれる
6. preview / recap・ja / en の全組み合わせで上記が成立する（少なくとも preview+ja と recap+ja のテスト）
7. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る

## 未解決の質問

- なし（挙動は 2026-07-18 のインシデント対応で Owner と合意済みの方針）
