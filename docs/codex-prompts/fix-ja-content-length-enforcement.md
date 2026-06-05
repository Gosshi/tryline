# Codex プロンプト: 日本語コンテンツの字数下限を QA で強制

> 仕様: `specs/fix-ja-content-length-enforcement.md`（権威。根因・受け入れ条件はそちら）
> 本ファイルは Owner が Codex に渡す作業指示。spec の内容は繰り返さない。
> 関連（壊さない/重複しない）: `fix-recap-mom-and-length.md`（recap プロンプト字数＝先行）／`feat-lineup-aware-previews.md`（実名活用）。

---

## タスク

日本語 preview/recap が目標字数に**恒常的に未達**（実測: ja preview 中央値1,063/目標1,500、ja recap 中央値1,211/目標2,000、ほぼ全件）。根因は「brevity バイアス」＋「**QA が下限未満を検知しても `verdict: publish` で公開してしまう**」。`specs/fix-ja-content-length-enforcement.md` に基づき、**QA を字数ゲート化＋加筆リトライ（最大1回）**を実装する。

## 確認すべき現状（根因の現物）

- `lib/llm/stages/qa.ts` / `lib/llm/prompts/qa-content.ts`: 字数下限未達を issue に出すが `verdict` を publish のまま返す（＝ゲートになっていない）。
- `lib/llm/pipeline.ts`: 生成→QA→保存の流れ。QA reject 時のリトライが無い。
- `lib/llm/prompts/generate-preview.ts`: 字数指示はあるが下限担保が弱い（recap は `fix-recap-mom-and-length` で強化済、preview は未）。

## 直すこと

1. **QA を字数ゲートに**:
   - 本文長が下限未満なら `verdict` を publish 以外（例 `revise`）にし、理由を返す。下限値は content_type/language 別に定義（preview/recap × ja/en）。
2. **加筆リトライ（pipeline・最大1回）**:
   - QA が revise（字数不足）を返したら、現本文を入力に「薄いセクションを指定字数まで加筆」する再生成を**1回だけ**実行 → 再 QA。
   - **リトライは1回上限**（無限ループ・コスト暴走を防ぐ。CLAUDE.md LLMコスト保護）。
   - リトライ後も未達なら publish するが warning ログ（可用性優先・spec 未解決質問2は既定でこの挙動、Owner が変えたければ後日）。
3. **preview プロンプト強化**: `fix-recap-mom-and-length` と同手法で下限担保の指示を preview にも適用。
4. （任意・Owner判断待ち）目標字数が過大なら現実値へ再設定（spec 未解決質問1）。初版は現目標維持でよい。

## エッジケース

- **英語は回帰させない**（既に達成）。下限は言語別に持つ（en の長い目標を ja に適用しない）。
- **水増し禁止**: 加筆で information_density 等 他QA指標を下げない（中身のある加筆）。
- 実名活用（feat-lineup-aware-previews）を壊さない。
- リトライ込みでもコストが1試合で想定内に収まること。

## 完了の定義（Done）

- [ ] spec「受け入れ条件」1〜7 を満たす。
- [ ] 変更: `qa.ts`/`qa-content.ts`（ゲート）・`pipeline.ts`（1回リトライ）・`generate-preview.ts`（下限強化）。`PROMPT_VERSION` 更新。
- [ ] テスト: 下限未満→revise→リトライ→publish の流れ、リトライ上限1回、en 非回帰、の単体テスト。
- [ ] `npm run typecheck`/`lint`/既存テスト green。
- [ ] 本番再生成は Owner 実行（PR に検証手順）。

## 検証コマンド（Codex が PR に記載・Owner が実行）

```
# マージ＆デプロイ後、短い ja preview を再生成して下限以上になるか確認
gh workflow run cron-ingest-league-one-lineups.yml \
  -f match_ids=96863688-cf14-40f8-b3d7-8d485ae5504b -f ingest=false -f content_type=preview -f language=ja
# 確認SQL: select length(content_md) from match_content where match_id='96863688-...' and content_type='preview' and language='ja';
```

## 注意（CLAUDE.md 準拠）
- LLM リトライは**最大1回**。コスト見積りを PR に併記。
- 本番 DB 書込・再生成は Owner 承認後に Owner 実行。Codex は production キーで自動実行しない。
