# Codex プロンプト: Web検索で信頼ソースから事実を取得（sourced_facts）

> 仕様: `specs/feat-web-sourced-facts.md`（権威）／調査: `docs/research-web-sourced-facts.md`
> 本ファイルは Owner が Codex に渡す作業指示。spec の内容は繰り返さない。

---

## タスク

ja コンテンツの「浅さ」を解くため、**OpenAI web_search で信頼ソースから事実を取得→出典付き構造化→ナラティブ/QA に統合**する。`specs/feat-web-sourced-facts.md` 準拠。**生再配信せず事実＋言い換え**、**#375 の捏造ガードを壊さない**こと。

## 設計の要点（必読）

- **モデル = `gpt-4o`**（eval 決定。Responses API の web_search ツール対応）。`lib/llm/models.ts` に集約。
- 新ステージ: web検索 → `{fact, source_url, confidence}[]` を取得 → **後段で allowlist フィルタ** → `match_sourced_facts` に upsert。
- assemble が `sourced_facts` を `AssembledContentInput` に載せる → ナラティブは **DB＋sourced_facts のみ**から記述 → **QA grounding を DB＋sourced_facts に拡張**。
- **試合単位キャッシュ**（ユーザー数で検索増やさない）。

## 必ず実装するガバナンス（eval で露呈した要件）

1. **allowlist は hard 制約（コードの後段フィルタ）**: 取得後、`source_domain` が allowlist 外の fact を**破棄**。プロンプトの「優先」だけに頼らない（eval で mini が賭けサイト sportytrader を引いた）。
   - allowlist 初版: 各リーグ/クラブ公式ドメイン ＋ `rugbypass.com` ＋ `league-one.jp`。設定は1箇所に集約（`lib/llm/sourced-facts/allowlist.ts` 等）。
2. **recency**: クエリに「injuries / latest team news / lineup changes」と直近指向を明示（欠場情報を確実に拾う）。
3. **2ソース/公式優先 → confidence**: 2ソース一致 or 公式=`high`、単一第三者=`medium`。ナラティブは high/medium のみ使用、QA は low/出典不一致を弾く。
4. **引用ポリシー**: 言い換え必須・直接引用≤15語・同一ソース複数引用なし（既存プロンプト方針に追記）。生本文は保存しない（事実＋出典のみ）。

## 参考にする既存コード

- パイプライン: `lib/llm/stages/assemble.ts`（AssembledContentInput 構築）／`lib/llm/stages/qa.ts`・`qa-content.ts`（#375 の grounding/verdict）／`lib/llm/pipeline.ts`。
- プロンプト: `lib/llm/prompts/generate-preview.ts`・`generate-recap.ts`（`feat-lineup-aware-previews` の実名活用と同居）。
- cron 雛形: `app/api/cron/*/route.ts`（`assertCronAuthorized`）。
- モデルID集約: `lib/llm/models.ts`。

## データモデル

`match_sourced_facts`（spec 参照）: match_id / content_type / fact / source_url / source_domain / confidence / fetched_at / model_version / metadata。一意 `(match_id, fact)`。RLS は既存コンテンツ準拠（読取可・書込サーバのみ）。マイグレーション追加。

## 入力 → 期待出力（決勝 `0fd7d8e6` で検証）

- 実行: `fetch-sourced-facts?match_id=0fd7d8e6-...`
- 期待: `match_sourced_facts` に allowlist ドメインのみの fact（例「Malcolm Marx は負傷で決勝欠場見込み（出典: 公式 or rugbypass）」）。賭け/ブログ由来は0件。
- その後プレビュー再生成 → 本文の情報密度↑・factual_grounding 維持（#375）・捏造ゼロ。

## エッジケース
- web_search が allowlist 内ソースを返さない試合 → sourced_facts 0件で正常（従来の DB のみ生成にフォールバック・エラーにしない）。
- 取得 fact が DB と矛盾（例 web のスコア誤り）→ confidence/2ソースで弾く。DB を正とする方針も検討。
- 段階導入: 対象外試合では本ステージをスキップ（フラグ/対象大会）。回帰なし。
- コスト保護: 1試合あたり検索回数の上限（例 ≤2）。試合単位キャッシュ。

## 完了の定義（Done）
- [ ] spec「受け入れ条件」1〜8 を満たす。
- [ ] 新ステージ＋`match_sourced_facts` マイグレーション＋assemble/prompt/qa 統合＋allowlist フィルタ。
- [ ] テスト: allowlist 外破棄、grounding 統合で factual 維持、0件フォールバック、キャッシュ。
- [ ] `npm run typecheck`/`lint`/既存テスト green。
- [ ] 本番取込・再生成は Owner 実行（PR に検証 SQL/手順）。コスト見積り併記。

## 注意（CLAUDE.md 準拠）
- 生スクレイプ本文の再配信禁止（事実＋出典のみ・言い換え）。robots/ToS 順守（allowlist＋OpenAI 経由）。
- 本番書込・LLM課金は Owner 承認後に Owner 実行。Codex は production キーで自動実行しない。
- Reddit/SNS は対象外（D009 待ち）。
