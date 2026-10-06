# Codex 指示書: 文書だけの変更で Vercel のビルドを走らせない

仕様書: `specs/chore-skip-docs-only-builds.md`（受け入れ条件は仕様書を正とする）

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。**

## やること
- 着手前に Vercel の公式文書（System Environment Variables と Ignored Build Step）で、`VERCEL_GIT_PREVIOUS_SHA` の中身と、終了コード（0＝ビルドしない、1＝ビルドする）を確かめ、PR 本文に引用する。
- `scripts/vercel-ignore-build.sh` を作り、`vercel.json` の `ignoreCommand` から呼ぶ。`docs/` と `specs/` の外に差分が無いときだけ 0、それ以外とあらゆる失敗は 1。
- 仕様書の受け入れ条件 1 のテストを足す（一時的な git リポジトリで実行）。

## 守ること
- `vercel.json` の `crons` は変えない。
- 判定に迷う場合（変数が空・SHA が無い・git が失敗）は必ずビルドする。
- `public/` を除外しない。

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて必ず実行し、結果を完了報告に含める。**
- 仕様書の受け入れ条件 2（壊して落ちる）と 4（この PR のビルドのログの判定の行）を PR 本文に貼る。PR を出したらマージを待つ。
