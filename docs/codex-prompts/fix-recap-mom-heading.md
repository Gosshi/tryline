# Codex プロンプト: recap MOM 見出し → 注目選手

## 仕様書

`specs/fix-recap-mom-heading.md` を読んで実装してください。

## 概要

`lib/llm/prompts/generate-recap.ts` の `hasLineups=true` ケースで出力される `# MOM` 見出しを `# 注目選手` に変更します。DB に公式 MOM データがないため LLM が推論した選手が公式と食い違うリスクを減らすための表記変更です。

## 対象ファイル

- `lib/llm/prompts/generate-recap.ts` のみ

## 変更手順

1. `PROMPT_VERSION` を `"recap@4.6.0"` に更新
2. `hasLineups=true` ケースの `structureInstruction` 配列内（L28〜L47 付近）で以下を変更:

   a. `"# MOM",` → `"# 注目選手",`

   b. `"- MOM: 300-400字。projected_lineups または match_events に存在する実名を使い、選出理由を具体化する",`
   → `"- 注目選手: 300-400字。projected_lineups または match_events に存在する実名を使い、この試合での貢献・プレー内容を具体的に記述する",`

   c. 末尾の禁止見出し列挙に `# MOM`・`# マン・オブ・ザ・マッチ` を追加:
   ```
   "**上記5つの見出し以外は絶対に追加してはならない。`# 試合概要`・`# 試合の流れ`・`# まとめ`・`# 総評` 等、リストに存在しない見出しの出力は禁止。**",
   ```
   →
   ```
   "**上記5つの見出し以外は絶対に追加してはならない。`# 試合概要`・`# 試合の流れ`・`# MOM`・`# マン・オブ・ザ・マッチ`・`# まとめ`・`# 総評` 等、リストに存在しない見出しの出力は禁止。**",
   ```

## 完了条件

- `pnpm tsc --noEmit` clean
- `pnpm lint` clean
- diff は `lib/llm/prompts/generate-recap.ts` の1ファイルのみ、変更行数は10行以内
