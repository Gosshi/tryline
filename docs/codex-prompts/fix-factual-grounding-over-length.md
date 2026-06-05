# Codex プロンプト: 捏造を字数より優先してブロック（#374 緊急是正）

> 仕様: `specs/fix-factual-grounding-over-length.md`（権威。根因・受け入れ条件はそちら）
> 本ファイルは Owner が Codex に渡す作業指示。spec の内容は繰り返さない。
> **優先度: 緊急**（#374 により live の決勝 ja プレビューに捏造統計が公開されている）。

---

## タスク

#374（字数下限の QA 強制＋加筆リトライ）が、**字数を稼ぐために統計を捏造させ、`factual_grounding:1` でも publish している**。`specs/fix-factual-grounding-over-length.md` に基づき、**「正確さ ＞ 長さ」に優先順位を是正**する。

実測（決勝 `0fd7d8e6` ja preview 再生成）: QA factual_grounding=1・issue「データに存在しない統計値を含む」なのに verdict=publish。本文に実在しない「リコー戦52-8」等。

## 確認すべき現状

- `lib/llm/stages/qa.ts`: `resolveVerdict` 等で、字数 issue を見て verdict を決めるが、**factual_grounding 低下/捏造 issue を publish ブロックにしていない**。
- `lib/llm/pipeline.ts`: 字数不足で加筆リトライ（`MAX_LENGTH_REVISION_ATTEMPTS=1`）するが、**リトライ結果の factual を前段と比較せず採用**している（捏造化した加筆をそのまま採用）。

## 直すこと

1. **factual_grounding を hard block に**（字数フロアより上位）:
   - factual_grounding が閾値未満（spec 既定 ≤2）または捏造 issue（「データに存在しない統計値を含む」）がある場合、verdict を **publish にしない**。
2. **加筆リトライの採否を factual で判定**:
   - 字数リトライ後の本文の factual_grounding が**前段より低下**したら、**リトライ結果を破棄し前段（短く正確）の本文・QA を採用**して publish（字数 warning は残してよい）。
   - 「捏造して長い」より「正確で短い」を常に優先。
3. 優先順位: **捏造ブロック ＞ 字数フロア**。

## エッジケース
- 既に正確＋字数充足（例: 3決 1,534字 factual4）は回帰させない（そのまま publish）。
- en 回帰なし。
- 字数フロアの「短く正確で publish（warning）」挙動は維持。捏造のときだけ block/破棄。
- リトライ後も factual 低のままなら publish しない（or 前段採用）。無限ループ禁止（リトライは従来通り最大1回）。

## 完了の定義（Done）
- [ ] spec「受け入れ条件」1〜7 を満たす。
- [ ] 変更: `qa.ts`（factual hard block）・`pipeline.ts`（リトライ採否を factual 比較）。必要なら `content-length.ts`。
- [ ] テスト: 捏造(factual低)→publishしない、加筆で factual 低下→前段採用、正確+充足→回帰なし、en 非回帰。
- [ ] `npm run typecheck`/`lint`/既存テスト green。

## 検証コマンド（Codex が PR に記載・Owner が実行）
```
# マージ&デプロイ後、決勝 ja preview を再生成 → 捏造ゼロを確認
gh workflow run cron-ingest-league-one-lineups.yml \
  -f match_ids=0fd7d8e6-37f9-4b58-82dd-9c2d5592fd64 -f ingest=false -f content_type=preview -f language=ja
# 確認: match_content の qa_scores.factual_grounding >= 3、本文に "52-8" 等の捏造スコアが無い
```

## 注意（CLAUDE.md 準拠）
- 本番再生成は Owner 承認後に Owner 実行。Codex は production キーで自動実行しない。
- リトライ最大1回（コスト保護）維持。
