---
name: content-regen
description: プレビュー・レビュー（recap）等の LLM コンテンツを再生成・バックフィルする運用のときに使う。「再生成して」「regen」「backfill」と言われたら起動。試し焼き必須ルールと本番スクリプトの起動方法。
---

# コンテンツ再生成の運用

**鉄則: いきなり全件を再生成しない。** 2026-06-12 に「プロンプト字数予算 < QA 最低 2000 字」の矛盾で 297 件が draft 化し本番から消失した事故がある。

## 実行前チェック

1. **プロンプトと QA の整合**: `lib/llm/prompts/` の字数・構成指示と、QA ステージの合格条件が矛盾しないか確認。
2. **コスト見積もり**: 件数 × モデル単価（`lib/llm/pricing.ts`）を Owner に提示し、承認を得てから実行する（CLAUDE.md の LLM コスト保護ルール）。
3. **対象の特定**: 対象 match_id を SQL で列挙し件数を確定させる。

## 実行手順（段階実行）

1. **試し焼き**: まず 3〜6 件に限定して実行。
2. **検品**: 生成物を読み、字数・QA 通過・冒頭パターンの収束（全部似た書き出しになっていないか）・統計捏造の有無を確認。
3. **全件実行**: 検品 OK 後にのみ全件。実行後、published 件数が減っていないか SQL で確認する。

## 本番環境でのスクリプト起動方法

```bash
node --env-file=.env.production.local tools/run-ts.cjs scripts/<script>.ts [args]
```

- `pnpm tsx` 直叩きはローカル Supabase に繋がって失敗するので使わない
- 主なスクリプト: `scripts/regenerate-overseas-content.ts`、`scripts/generate-recaps.ts`、`scripts/backfill-*.ts`
- 実行は Owner の承認後。Claude Code が独断で本番書き込みスクリプトを走らせない
