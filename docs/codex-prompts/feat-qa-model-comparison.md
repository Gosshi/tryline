# Codex 指示書: 品質チェックのモデルを、既存の記事で比べる

仕様書: `specs/feat-qa-model-comparison.md`（受け入れ条件は仕様書を正とする）。

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。** 仕様書と実際のコードが食い違っていたら（行番号の先に該当の処理が無い、関数名や引数が違う、等）、実装を進めずにその場で止めて報告する。

## やること
- `lib/llm/pipeline.ts`:
  - `generateMatchContent` の中の `runQualityGate`（`:420-504`）を、モジュール直下の `runQualityGateForNarrative` として export する（仕様書 1 節の引数）。`generateMatchContent` はそれを呼ぶように置き換える。**挙動は変えない。**
  - `loadQualityGateInput` を export する（仕様書 1 節）。`logPipelineRun` と通知は呼ばない。`generateMatchContent` 側は変えない。
- `scripts/compare-qa-models.ts` を新規作成する（仕様書 2 節）。引数の読み方・費用見積もり・`--dry-run`・出力の書き方は、`scripts/trial-content-models.ts` の作りに合わせる。
- 受け入れ条件 1〜9 のテストを書く（スクリプトのテストは `tests/scripts/` に置く。`tests/scripts/trial-content-model-routing.test.ts` のモックの組み方を参考にする）。

## 守ること
- `MODELS` の値・プロンプト・QA の基準値・再試行の回数を変えない。
- `generateMatchContent` の既存テストの期待値を変えない・弱めない・消さない。
- スクリプトは DB に書き込まない。`logPipelineRun`・通知・IndexNow・再検証を呼ばない。
- 比較を本番で実行しない（LLM 費用がかかる。実行は Owner の承認のうえ Claude Code が行う）。`--dry-run` はモックかオフラインで確認する。
- 本番 DB には触らない。

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて実行し、結果を完了報告に含める。**
- PR 本文に貼るもの:
  - `runQualityGate` を外へ出す前と後の差分の要点（移した行と、引数にした外側の変数の一覧）
  - 受け入れ条件 10（(a)・(b) で落ちたテストの出力。変更は戻す）
  - モックでの `summary.md` の出力例（2×2 表と、判定が分かれた記事の表）
- マージ前に `gh pr checks` が緑であること。
- PR を出したら、マージを待つ。
