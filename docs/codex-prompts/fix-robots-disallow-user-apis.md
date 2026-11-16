# Codex 指示書: ユーザー別 API を、検索エンジンのクロール対象から外す

仕様書: `specs/fix-robots-disallow-user-apis.md`（受け入れ条件は仕様書を正とする）。

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。** 仕様書と実際のコードが食い違っていたら、実装を進めずにその場で止めて報告する。

## やること
- 着手前に `ls app/api/me app/api/matches app/api/home app/api/user app/api/chat` を実行し、結果を PR 本文に貼る。仕様書に書かれていないルートがあり、それが検索に必要な公開データを返すなら、止めて報告する
- `app/robots.ts` の `rules.disallow` を、仕様書の配列にする（順序もそのまま）
- 受け入れ条件 1〜3 のテストを足す

## 守ること
- `"/api/"` をまとめて塞がない。`/api/og/` を塞がない
- `allow` と `sitemap` を変えない
- API の実装を変えない

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて実行し、結果を完了報告に含める。**
- PR 本文に、受け入れ条件 4 の失敗出力（変更は戻す）と、条件 6（プレビュー環境の `/robots.txt`。開けなければ保留と書く）を貼る
- マージ前に `gh pr checks` が緑であること
- PR を出したら、マージを待つ
