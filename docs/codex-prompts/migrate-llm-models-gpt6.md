# Codex 指示書: LLM モデルを GPT-6 系へ移す（段階 A）

仕様書: `specs/migrate-llm-models-gpt6.md`（受け入れ条件は仕様書を正とする）。この PR は**段階 A だけ**。

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。** 仕様書と実際のコードが食い違っていたら（行番号の先に該当の呼び出しが無い、関数名や引数が違う、等）、実装を進めずにその場で止めて報告する。

## やること
- `lib/llm/models.ts`: `CHAT` を `"gpt-6-luna"` にする。**`FAST`・`NARRATIVE`・`WEB_SEARCH` は変えない。**
- `app/api/chat/[matchId]/route.ts`: `chat.completions.create` に `reasoning_effort: "none"` を足す。出力上限 1024 は、インストール済みの `openai` SDK の型で推論モデルに使えるパラメータ名で渡す（`max_tokens` が使えないなら `max_completion_tokens`）。どちらにしたかと、その根拠（型定義のファイルと行）を PR 本文に書く。
- `scripts/trial-content-models.ts`:
  - `TrialConfig` に `"fast6"`・`"sol"` を足し、`getModels` に仕様書 2 節の表を実装する。
  - 設定の検証（今の `:91-96`）を「`current` を必ず含み、ほかに 1 つ以上」に変える。
  - `comparisonQaModel` は、`fast` を替える設定（`gpt6`・`fast6`）だけで使う。
- 受け入れ条件 1〜9 のテストを書く・足す。

## 守ること
- `FAST`・`NARRATIVE`・`WEB_SEARCH` の値を変えない（段階 C は別 PR）。
- プロンプト・QA の基準値・再試行の回数・`reasoning.effort`（記事生成側）を変えない。
- 既存のテストの期待値を弱めない・消さない。変えてよいのは、チャットのモデル名の期待値だけ。
- 試し焼きを実行しない（LLM 費用がかかる。実行は Owner の承認のうえ Claude Code が行う）。`--dry-run` は実行してよい。
- 本番 DB には触らない。

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて実行し、結果を完了報告に含める。**
- PR 本文に貼るもの:
  - 出力上限のパラメータ名と、その根拠
  - 受け入れ条件 10（(a)・(b) で落ちたテストの出力。変更は戻す）
  - `--dry-run --matches <任意の4件> --content-type recap --config current --config fast6 --config sol --max-usd 4` の見積もり出力
- マージ前に `gh pr checks` が緑であること。
- マージ後の本番確認（仕様書「本番操作」）は Claude Code が行う。
- PR を出したら、マージを待つ。
