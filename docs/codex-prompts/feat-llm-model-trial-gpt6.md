# Codex 指示書: 記事生成モデルを GPT-6 系に切り替えるかの比較（試し焼き）

仕様書: `specs/feat-llm-model-trial-gpt6.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## 直したいこと

本文生成は `gpt-5.6-terra`、抽出・QA は `gpt-5.6-luna` に固定されている（`lib/llm/models.ts`）。9/22 公開の `gpt-6-sol`・`gpt-6-luna` のほうが安いが、このプロジェクトの記事で品質が保てるかは試さないと分からない。
**本番の挙動は変えずに**、モデルを差し替えた試し焼き（DB に書かない）ができるようにする。

## やること

1. `lib/llm/pricing.ts`: `gpt-6-astra`（10 / 50）・`gpt-6-sol`（2 / 10）・`gpt-6-luna`（0.1 / 0.5）を足し、`gpt-5.6-sol` を 4 / 20 に直す
2. `generateMatchContent`（`lib/llm/pipeline.ts:184`）に任意の `options.models`（`narrative`・`fast`）を足し、各段階へ引き回す。渡さなければ今の `MODELS`
3. `scripts/trial-content-models.ts`: 仕様書の「試し焼きスクリプト」のとおり

## 触るファイル

- `lib/llm/pricing.ts`
- `lib/llm/pipeline.ts`
- `lib/llm/stages/generate-narrative.ts`（`:70`・`:120`）、`extract-facts.ts`（`:77`）、`qa.ts`（`:709`）、`verify-entities.ts`（`:155`）
- 新規: `scripts/trial-content-models.ts` とテスト
- 既存テスト（単価・パイプライン）への追加

## 処理すべきエッジケース

1. **表に無いモデルは今までどおり例外**（`normalizeModelForPricing`）。GPT-6 を足すだけで、この挙動は変えない
2. スナップショット名（`gpt-6-sol-2026-09-22` のような形）でも単価が引ける（前方一致）
3. 試し焼きは**保存・公開・通知・IndexNow・X 投稿のどれも通らない**。`generateMatchContent` を丸ごと呼ぶと保存まで進むので、保存の手前で止める仕組み（例: `options.persist = false` で保存処理を飛ばす）を入れる。本番の呼び出しは `persist` を渡さず、今までどおり保存する
4. `--config current` と `--config gpt6` を同じ試合で続けて走らせる。片方が失敗しても、もう片方の結果は出す
5. 走らせる前に費用を見積もり、`--max-usd`（既定 2）を超えたら LLM を呼ばずに止まる

## やってはいけないこと

- `MODELS` の既定値を変えること（比較の後、別 PR）
- `WEB_SEARCH`・`CHAT` を変えること
- プロンプト・QA 基準・再試行回数を変えること
- `reasoning.effort` を指定すること
- 試し焼きを実行すること（LLM 費用がかかる。Owner の承認のうえで別途行う）

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test`（**3 つとも必ず実行し、結果を完了報告に含める**）
- 受け入れ条件 8: 「差し替えを無視する実装」「保存まで進む実装」で一時的に壊して落ちることを確認し、PR 本文に書く（コミットしない）
- `--dry-run` をローカルで実行し、見積もりの出力例を PR 本文に貼る（LLM は呼ばない）

## 完了時

- PR 本文に: 変更ファイル一覧、受け入れ条件 1〜9 それぞれの確認方法と結果、「壊して落ちた」確認の内容、`--dry-run` の出力例
- ブランチは main から新しく切る。`git stash -u` は使わない
- PR 作成まで。マージはしない
