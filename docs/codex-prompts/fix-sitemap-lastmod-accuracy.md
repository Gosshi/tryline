# Codex 指示書: サイトマップの最終更新日を、実際の更新日時にする

仕様書: `specs/fix-sitemap-lastmod-accuracy.md`（受け入れ条件は仕様書を正とする）。

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。** 仕様書と実際のコードが食い違っていたら（行番号の先に該当の処理がない、関数名や型が違う、等）、実装を進めずにその場で止めて報告する。

## やること
- `lib/db/queries/competitions.ts` に `listCompetitionLastModified()` を足す（仕様書「API サーフェス 1」）。`matches` と `match_content` は 1,000 行を超えるので、`.range()` で全件読む。ページングの例は `lib/db/queries/matches.ts:2148` 付近
- `lib/db/queries/matches.ts` の `listMatchIdsWithContent`（`:1815`）を全件取得にする（仕様書「API サーフェス 2」）。`.order("id")` を足して順序を固定する
- `app/sitemap.ts` を仕様書「サイトマップの規則」の表どおりにする。`lastModified` に `new Date()` を使う箇所をなくし、正しく出せないページはプロパティごと省く
- 受け入れ条件 1〜8 のテストを `tests/app/sitemap-lastmod.test.ts` に書く。モックの組み方は `tests/app/sitemap-calendar.test.ts` に合わせる

## 守ること
- サイトマップに載せる URL を増減させない（`listMatchIdsWithContent` の打ち切りで漏れていた試合が戻る分だけは増えてよい）
- `changeFrequency`・`priority` を変えない
- 既存テストの期待値を変えない・弱めない・消さない
- 本番 DB に触らない。マイグレーションを足さない

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて実行し、結果を完了報告に含める。**
- PR 本文に貼るもの:
  - 受け入れ条件 8（(a)・(b) で落ちたテストの出力。変更は戻す）
  - 受け入れ条件 10（プレビュー環境の `/sitemap.xml` の全 URL 数、`/matches/` の URL 数、今日の日付の `<lastmod>` を持つ URL 数と、数えたコマンド）。プレビューが SSO で開けない場合は、その旨を書いて保留にする（Claude Code が確認する）
- マージ前に `gh pr checks` が緑であること
- PR を出したら、マージを待つ
