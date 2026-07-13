---
name: content-regen
description: プレビュー・レビュー（recap）等の LLM コンテンツを再生成・バックフィルする運用のときに使う。「再生成して」「regen」「backfill」と言われたら起動。試し焼き必須ルールと本番スクリプトの起動方法。
---

# コンテンツ再生成の運用

**鉄則: いきなり全件を再生成しない。** 2026-06-12 に「プロンプト字数予算 < QA 最低字数」の矛盾で 297 件が draft 化し本番から消失した事故がある（QA 最低字数は `lib/llm/content-length.ts` を正とする。値を書き写さず、実行前に必ずこのファイルで確認すること）。

## 実行前チェック

1. **プロンプトと QA の整合**: `lib/llm/prompts/` の字数・構成指示と、QA ステージの合格条件が矛盾しないか確認。
2. **コスト見積もり**: 件数 × モデル単価（`lib/llm/pricing.ts`）を Owner に提示し、承認を得てから実行する（CLAUDE.md の LLM コスト保護ルール）。
3. **対象の特定**: 対象 match_id を SQL で列挙し件数を確定させる。

## 実行手順（段階実行）

1. **試し焼き**: まず 3〜6 件に限定して実行。
2. **検品**: 生成物を読み、字数・QA 通過・冒頭パターンの収束（全部似た書き出しになっていないか）・統計捏造の有無を確認。
3. **全件実行**: 検品 OK 後にのみ全件。実行後、published 件数が減っていないか SQL で確認する。

## 公開停止（draft 戻し / unpublish）

捏造・事故コンテンツを見つけたとき、再生成の前にまず公開を止める手順。

1. **対象を確定**: 対象 `match_id` を SQL で列挙し、件数と現在の `status` をログに残す（`scripts/cleanup-contaminated-events.ts` に前例のパターンがある: `match_content` を `status='published'` かつ対象 `match_id` で絞り込み、`status='draft'` へ update）
2. **Owner承認後に実行**: この操作は `UPDATE`（`status` の書き換えのみ）なので、Owner の明示的承認を得れば Claude Code 自身が実行してよい。対象 `match_id` と絞り込み条件を先に提示すること
3. **実行後確認**: 対象件数分だけ `status='draft'` に変わったこと、対象外のレコードに影響していないことを SQL で確認する

## 本番環境でのスクリプト起動方法

```bash
node --env-file=.env.production.local tools/run-ts.cjs scripts/<script>.ts [args]
```

- `pnpm tsx` 直叩きはローカル Supabase に繋がって失敗するので使わない
- 主なスクリプト: `scripts/regenerate-overseas-content.ts`、`scripts/generate-recaps.ts`、`scripts/backfill-*.ts`
- 実行は Owner の承認後。Claude Code が独断で本番書き込みスクリプトを走らせない
