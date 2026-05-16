# レビュープロンプトバージョンの更新と既存レビューの再生成

## 背景

PR #199（p7-review-heading-unify）でレビュー生成プロンプトから「とスコア分析」を削除したが、
`PROMPT_VERSION` を据え置いたため、既存レビュー（804件）がすべて `recap@2.0.0` として記録済みとなった。

`regenerate-overseas-content.ts` は「現バージョンと一致するものはスキップ」するため、
新しいプロンプトで再生成されていない。

## スコープ

対象:
- `lib/llm/prompts/generate-recap.ts` — バージョン番号を 1 行変更

対象外:
- プロンプト本文（変更しない）
- preview プロンプト

## 変更内容

`lib/llm/prompts/generate-recap.ts` L7:

変更前:
```ts
export const PROMPT_VERSION = "recap@2.0.0";
```

変更後:
```ts
export const PROMPT_VERSION = "recap@2.1.0";
```

この 1 行のみ変更する。

## マージ後に Owner が実施すること

```bash
# Premiership（「とスコア分析」が残る既存レビューを再生成）
pnpm tsx scripts/regenerate-overseas-content.ts --content-type=recap --family=premiership --dry-run
pnpm tsx scripts/regenerate-overseas-content.ts --content-type=recap --family=premiership

# Top 14（「試合レビュー: チーム名 vs チーム名」形式を再生成）
pnpm tsx scripts/regenerate-overseas-content.ts --content-type=recap --family=top-14 --dry-run
pnpm tsx scripts/regenerate-overseas-content.ts --content-type=recap --family=top-14
```

他の競技（Six Nations 等）は現プロンプトと差異がないためスキップされる。

## 受け入れ条件

- [ ] `PROMPT_VERSION` が `"recap@2.1.0"` になっている
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る
- [ ] マージ後に上記スクリプトを実行し、Premiership・Top 14 のレビューで
      「とスコア分析」「試合レビュー: チーム名 vs チーム名」が消えていることを確認
