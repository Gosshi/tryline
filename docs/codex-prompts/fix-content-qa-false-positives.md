# Codex 指示書: 記事の品質チェックの誤検知と、抽出の数値誤りを減らす

仕様書: `specs/fix-content-qa-false-positives.md`
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら、実装を進めずその場で止めて Owner に確認する。

## 直すこと（4 件、独立している）

1. QA に `h2h_last_5` と `kickoff_at_jst` を根拠として渡す（`qa-content.ts`、`pipeline.ts`）。
2. 選手別の得点ガードで、キッカー不明のチームの選手はトライだけを比べる（`qa.ts:434-456`）。
3. 人名照合で根拠なしになった表記を、もう 1 回だけ照合し直す。LLM の答えはコードの条件で確かめ、失敗したら 1 回目の結果を使う（`verify-entities.ts`）。
4. `key_stats` に勝敗数・連続の回数・試合数を足し、抽出プロンプトに「数え直さない・計算しない」を指示する（`assemble.ts`、`types.ts`、`extract-tactical-points.ts`）。

## 触るファイル

- `lib/llm/prompts/qa-content.ts`、`lib/llm/pipeline.ts`
- `lib/llm/stages/qa.ts`（必要なら `lib/stats/player-stats.ts`）
- `lib/llm/prompts/verify-entities.ts`、`lib/llm/stages/verify-entities.ts`
- `lib/llm/stages/assemble.ts`、`lib/llm/types.ts`、`lib/llm/prompts/extract-tactical-points.ts`
- 版番号: `qa@2.12.0`、`entity-verification@1.2.0`、`extract@2.5.0`、`preview@3.15.2`、`recap@4.21.1`
- テストと、A のプロンプトのスナップショット（`tests/llm/__snapshots__/content-prompt-a-baseline.test.ts.snap`）

## 守ること

- **安全側を弱めない。**
  - 人名照合の 2 回目は、許可集合と sourced_facts に対応するかをコードで確かめる（`parseEntityVerificationResponse` と同じ条件）。LLM が名前を返しただけで許可しない。
  - 2 回目が失敗したら 1 回目の結果を使う。
  - 選手別の得点ガードは、トライの誤りと、キッカーが分かっているチームのキックの誤りを、今までどおり捕まえる。
- 本文プロンプト（A、B とも）の文言は変えない。変わるのは、埋め込まれる `key_stats` の JSON の項目だけ。
- 他の QA ガードと、採点基準（ルーブリック）は変えない。
- モデルは変えない。

## 処理すべきエッジケース

1. `h2h_last_5` が空の試合: grounding ブロックを出さない（`recent_form` のブロックと同じ扱い）。
2. `kickoff_at_jst` が null: `match_metadata` に入れない。
3. 同じチームで、キッカー名のあるキックと無いキックが混ざっている場合: 1 件でも無ければ、そのチームはキッカー不明として扱う。
4. 本文から読み取った選手が、どのイベントにも出てこない場合: 今までどおり不一致とする。
5. 人名照合の 2 回目の対象は、1 回目の `ungroundedSurfaces` だけ。1 回目で許可された表記を 2 回目に渡さない。
6. `current_streak`: 引き分けも 1 つの結果として数える（「2 引き分け中」など）。
7. `recent_form` の並びが新しい順であることを、既存のコードで確かめてから数える。並びが保証されていなければ、`kickoff_at` で並べ替えてから数える。

## 検証

- `pnpm lint`、`pnpm typecheck`、`pnpm test` を実行する（**3 つとも必ず実行し、結果を完了報告に含める**）。
- 「壊して落ちる」確認（コミットしない）。それぞれの内容と結果を PR 本文に書く。
  - キッカー不明の判定を外すと、受け入れ条件 2 のテストが落ちる。
  - 人名照合の 2 回目の結果をコードの条件を通さずに信じると、受け入れ条件 3 のテストが落ちる。
  - `h2h_last_5` の grounding ブロックを外すと、受け入れ条件 1 のテストが落ちる。
- A のプロンプトのスナップショットの差分が `key_stats` の追加項目だけであることを、PR 本文に示す。

## やってはいけないこと

- LLM を実際に呼ぶこと（テストはすべてモック）。
- 監査ツールや A/B スクリプトを実行すること（マージ後に Claude Code が行う）。
- 他のガード（試合時間、未裏付け統計、ゼロ矛盾、ポジション語）を変えること。

## 完了時

- PR 本文に書くこと:
  - 変更したファイルの一覧
  - 受け入れ条件 1〜6 のそれぞれについて、確認の方法と結果
  - 「壊して落ちた」確認の内容
  - スナップショットの差分
- ブランチは main から新しく切る。共有の作業ツリーにある未コミットの差分を巻き込まない。`git stash -u` は使わない。
- PR の作成まで。マージはしない。
