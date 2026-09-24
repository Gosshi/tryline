# Codex 指示書: 記事プロンプト B の改訂（B2）と、B1 との比較の仕組み

仕様書: `specs/feat-content-prompt-b2.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## やること

1. `lib/llm/prompts/variant-b/` の 3 ファイルの文言を、仕様書の付録どおりに B2 へ改訂する。
   - 付録の【追加】【変更】は説明のための印なので、プロンプトには入れない。
   - 版番号は `preview-b@0.2.0`、`recap-b@0.2.0`。
2. `scripts/ab-content-prompts.ts` の `run` に `--variants` と `--pair-with` を足す。

## 触るファイル

- `lib/llm/prompts/variant-b/shared.ts`、`generate-preview-b.ts`、`generate-recap-b.ts`
- `scripts/ab-content-prompts.ts`
- `tests/llm/variant-b-prompts.test.ts`、`tests/scripts/ab-content-prompts.test.ts`

## 守ること

- A のプロンプト（`lib/llm/prompts/` の既存ファイル）と `generate-narrative.ts` の A の経路は変えない。A のスナップショットのテストが、変更なしで通ること。
- B のデータブロックの組み立て（`buildVariantBDataBlocks`、`buildRecapDataBlocks`）と `buildMatchPhaseFacts` は変えない。
- 付録の文言は変えない。改行位置の調整は可。
- `--pair-with` は、前回のフォルダを**読むだけ**にする。前回のフォルダのファイルを書き換えない。

## 処理すべきエッジケース

1. `--pair-with` のフォルダに `ledger.json` か `blind-key.json` がない: 例外にして、何も生成しない（LLM を呼ぶ前に確かめる）。
2. 前回のフォルダに、ある fixture の B の本文がない: その fixture は B2 を生成したうえで並べずに、警告を出す（B2 の本文と ledger には残す）。
3. `--variants` に A・B 以外の値: 例外。
4. `--variants B` で `--pair-with` がない場合: B2 の本文と ledger だけを書き、`blind/` は作らない。
5. 費用の上限の見積もりは、生成する版の数に合わせる（`--variants B` なら fixture 数 × 1）。

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行する（**3 つとも必ず実行し、結果を完了報告に含める**）。
- 「壊して落ちる」確認（コミットしない）。それぞれの内容と結果を PR 本文に書く。
  - B2 の【有料部分の役割】ブロックを消すと、受け入れ条件 1 のテストが落ちる。
  - `--pair-with` で前回の B ではなく A の本文を拾う実装にすると、受け入れ条件 5 のテストが落ちる。
- `run --variants B --dry-run` を、テスト用の fixture で実行した出力を PR 本文に貼る（LLM を呼ばないこと）。

## やってはいけないこと

- LLM を実際に呼ぶこと（`--dry-run` 以外の実行はしない。実行は Claude Code が Owner の承認を得て行う）。
- `tmp/prompt-ab/` 配下の既存の実行結果を変更すること。
- A のプロンプト、QA、ガード、抽出を変えること。

## 完了時

- PR 本文に書くこと:
  - 変更したファイルの一覧
  - 受け入れ条件 1〜7 のそれぞれについて、確認の方法と結果
  - 「壊して落ちた」確認の内容
  - `--dry-run` の出力
- ブランチは main から新しく切る。共有の作業ツリーにある未コミットの差分を巻き込まない。`git stash -u` は使わない。
- PR の作成まで。マージはしない。
