# Codex プロンプト: feat-expand-sourced-facts-allowlist-2

`specs/feat-expand-sourced-facts-allowlist-2.md` の受け入れ条件に従って実装してください。

## やること

`lib/llm/sourced-facts/allowlist.ts` の `MEDIA_DOMAINS` 配列に以下4件を追加する:

- `nbcsports.com`
- `sports.yahoo.com`
- `onrugby.it`
- `news.yahoo.co.jp`

既存の `isAllowedSourcedFactDomain` のテスト（該当するテストファイルを検索して確認）に、この4ドメインが `true` を返すケースを追加してください。既存の許可・非許可ドメインの判定には影響しないことをテストで確認してください。

## 参考

- 直前の同種PR（2026-07-11、`feat-expand-sourced-facts-allowlist.md`）が全く同じパターンの変更なので、そのdiffのスタイルに揃えてください（`git log --oneline -- lib/llm/sourced-facts/allowlist.ts` で該当コミットを確認できます）

## 完了の定義

- spec の受け入れ条件4項目を全て満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
- 曖昧な点があれば実装前にその場で報告してください
