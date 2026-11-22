# Codex 指示書: ネーションズチャンピオンシップの決勝週末と同じ組み合わせの試合が書き換わる問題を直す

仕様書: `specs/fix-nc-finals-kickoff-collision.md`（受け入れ条件は仕様書を正とする）。

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。** 仕様書と実際のコードが食い違っていたら（関数名・型・行の処理が違う等）、実装を進めずにその場で止めて報告する。

**期限: 11/27 の昼までに本番修復を終えたい。PR は早めに出す。**

## やること
- A: `lib/ingestion/sources/wikipedia-nations-championship.ts` の `kickoffTimeByTeams` を、組み合わせ＋36 時間以内で 1 件に絞る引き方に変える
- B: `lib/ingestion/upsert.ts` の `writeMatches` と `planMatchUpserts` に、終了済みの行のキックオフを 48 時間を超えて動かさない歯止めを足す
- C: 2026-11-22 12:12:51Z に `452acd61-428e-45f5-af8a-691e774787a9` のプレビューを作った経路を特定する。`generateMatchContent` で、終了済みの試合のプレビューを skip する
- D: `scripts/repair-nc-2026-finals-collision.ts`（dry-run のみ・本番に書き込まない）
- 受け入れ条件 1〜5 のテスト

## 守ること
- 本番 DB に書き込まない。D のスクリプトにも書き込みのコードを入れない（UPDATE 文は文字列として出力するだけ）
- D の実行は読み取りのみ。World Rugby と Wikipedia への取得は既存の `fetchWithPolicy` と既存の取得関数を使う
- B は全大会に効く。既存の取り込みテストの期待値を変えない・弱めない・消さない
- C で LLM を呼ぶコードを本番で実行しない

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて実行し、結果を完了報告に含める。**
- PR 本文に貼るもの:
  - 受け入れ条件 6（D の本番 dry-run の出力。書き込み 0 件）
  - 受け入れ条件 7 で落ちたテストの出力（変更は戻す）
  - C で特定した経路
- マージ前に `gh pr checks` が緑であること
- PR を出したら、マージを待つ
