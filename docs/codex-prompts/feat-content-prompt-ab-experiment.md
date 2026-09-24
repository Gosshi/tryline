# Codex 指示書: 記事生成プロンプトの A/B 比較の仕組みを作る

仕様書: `specs/feat-content-prompt-ab-experiment.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## 作るもの

現行のプロンプト（A）と書き換え版（B）を、同じ固定入力・同じモデル・同じ QA で比べるための仕組み。**本番の記事生成の動きは 1 バイトも変えない。** 実行（LLM の呼び出し）は Claude Code が Owner の承認を得てから行う。Codex は実行しない。

1. B 版のプロンプトビルダー（`lib/llm/prompts/variant-b/` 配下の 3 ファイル）。文言は仕様書の付録 A をそのまま使う。
2. `generateMatchContent` に試し焼き専用のオプションを 3 つ足す: `promptVariant`、`frozenInput`、`trialFirstAttemptOnly`。
3. `scripts/ab-content-prompts.ts`（`freeze` と `run`）とテスト。

## 触るファイル

- `lib/llm/pipeline.ts`（オプションの追加、`PipelineTrialDetails` の項目追加）
- `lib/llm/stages/generate-narrative.ts`（variant の分岐、戻り値に `prompt` を追加）
- 新規: `lib/llm/prompts/variant-b/shared.ts`、`generate-preview-b.ts`、`generate-recap-b.ts`
- 新規: `scripts/ab-content-prompts.ts`
- テスト: `tests/llm/` と `tests/scripts/` の既存の配置に合わせる

## 進める順番

1. **最初に、変更前の main で A の結合プロンプトを保存する**（受け入れ条件 1）。
   - テスト用の fixture 入力を作り、プレビュー 1 通り・レビュー 3 通り（ラインアップあり／データが乏しい／イベントのみ）で結合プロンプトを保存する。
   - `buildJapaneseNarrativePrompt` が export されていなければ、テストのために export してよい。
   - この保存をしてからコードを変える。順番を逆にすると、A が変わっていないことを証明できない。
2. B のビルダーを作り、受け入れ条件 5・6・7 のテストを書く。
3. pipeline のオプションを足し、受け入れ条件 2・3・4 のテストを書く。
4. スクリプトを作り、受け入れ条件 8・9 のテストを書く。

## 守ること

- **A の経路を変えない。** 既存のプロンプトファイル（`generate-preview.ts`、`generate-recap.ts`、`shared-prompt-blocks.ts`、`qa-content.ts`、`extract-tactical-points.ts`、`verify-entities.ts`）は編集しない。B は新しいファイルで作り、共通の部品は import して使う。
  - 部品を再利用するために既存ファイルから関数を切り出す必要がある場合は、止めて Owner に確認する。
- 本番の `PROMPT_VERSION`（`preview@3.15.0`、`recap@4.20.0`）を上げない。B の版は `preview-b@0.1.0`、`recap-b@0.1.0`。
- 新しいオプションは `persist: false` のときだけ使える。それ以外は例外にする。
- `MODELS` と QA・ガード（`qa.ts`、`fabrication-guard.ts`、人名照合）は変えない。
- 付録 A の文言は変えない。改行位置の調整は可。
- スクリプトは DB に書き込まない。`pipeline_runs` にも記録しない（`persist: false` の既存の動きのまま）。

## 処理すべきエッジケース

1. プレビューの freeze で、試合が既に終わっている（status が scheduled でない、またはスコアがある）場合は拒否する。**試合後の入力をプレビューに混ぜない**ためで、仕様上いちばん大事な拒否条件。
2. レビューの freeze で、イベントが 0 件、または `eventIntegrity` が mismatch の場合は拒否する。
3. B のレビュービルダーにイベント 0 件の入力が来たら例外。
4. 片側だけ確定ラインアップがある試合: `sanitizeUnconfirmedProjectedLineups` を A と同じく通す。未確定側の選手名が B のプロンプトに出ないことをテストする。
5. sourced_facts が 0 件のとき: 付録 A-4 の「なし」の文言を使う。
6. プレーオフ: `matchPhaseBlock` の事実部分だけを残す（決勝・準決勝・3 位決定戦の区別、3 位決定戦では決勝・優勝の語を使わない）。「重みを強調」などの演出の指示と、「次のプレーオフの相手を特定」は B に入れない。
7. 費用の上限: 見込み額が上限を超えるなら、最初の 1 本も呼ばずに止まる。途中で超えそうになったら、そこで止め、それまでの結果を書き出す。
8. `blind/` のファイルに版名・版番号・QA 結果が混ざらないこと。本文に「B」などの文字が偶然含まれるのは構わない。

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行する（**3 つとも必ず実行し、結果を完了報告に含める**）。
- 「壊して落ちる」確認（コミットしない）。それぞれの内容と結果を PR 本文に書く。
  - A の分岐に 1 文字足すと、受け入れ条件 1 のテストが落ちる。
  - 付録 A の文言に `最低3名` を混ぜると、受け入れ条件 5 のテストが落ちる。
  - freeze の試合後チェックを外すと、受け入れ条件 8 のテストが落ちる。
- `run --dry-run` を、テスト用の fixture で実行した出力を PR 本文に貼る（LLM を呼ばないこと）。

## やってはいけないこと

- 既存の本番プロンプトファイルを編集すること。
- LLM を実際に呼ぶこと（テストはすべてモック。`--dry-run` 以外の実行はしない）。
- `persist: true` の経路で新しいオプションを使えるようにすること。
- QA の採点基準やガードを変えること。

## 完了時

- PR 本文に書くこと:
  - 変更したファイルの一覧
  - 受け入れ条件 1〜10 のそれぞれについて、確認の方法と結果
  - 「壊して落ちた」確認の内容
  - `--dry-run` の出力
- ブランチは main から新しく切る。共有の作業ツリーにある未コミットの差分を巻き込まない。`git stash -u` は使わない。
- PR の作成まで。マージはしない。
