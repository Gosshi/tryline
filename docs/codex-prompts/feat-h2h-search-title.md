# Codex 指示: H2H ページの検索タイトルに競技語を入れる

`specs/feat-h2h-search-title.md` を読んで実装すること。

変更は `app/h2h/[pair]/page.tsx` の metadata と `tests/app/h2h-page.test.tsx` に限定する。

- title と description に「ラグビー」を加える
- title / description の Open Graph への対応を維持する
- 「Tryline 収録分」を消さない
- 本文、H2H の収録範囲、データ取得、JSON-LD、sitemap、CTA を変えない
- 依存追加、LLM、DB 変更をしない

検証は lint、typecheck、関連テスト、build を実行する。隔離環境に必要な環境変数が無い場合は、値を読まずにその理由を報告すること。
