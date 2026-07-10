`/specs/feat-rss-feeds.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- `app/sitemap.ts` の実装（Next.js App RouterでのXMLレスポンス生成パターン）を参考にすること
- 最新レビュー一覧の取得は `lib/db/queries/match-content.ts` の既存クエリ（公開済みrecapの一覧取得）を再利用すること
- RSS 2.0のXML構造は標準仕様に従う（`<channel>`・`<item>`・`<title>`・`<link>`・`<description>`・`<pubDate>`）

入出力の例:
- `GET /rss.xml` → `Content-Type: application/rss+xml` で、直近公開レビュー20〜30件を含むXMLが返る
- 各 `<item>` の `<link>` は `https://www.trylinerugby.com/matches/{id}` 形式

処理すべきエッジケース:
- レビュー本文が長い場合、`<description>` には冒頭の抜粋（例: 200字程度）のみを含め、全文は含めない
- 生テキストの著作権配慮（15語超の直接引用禁止等）は本フィードには関係ない（Tryline自身が生成したレビュー文なので問題ないが、念のため確認する）

完了の定義:
- specs の受け入れ条件 1〜4 をすべて満たす（受け入れ条件5の本番デプロイはOwnerが別途行うため対象外）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 生成したXMLが標準的なRSSバリデーター（例: W3C Feed Validation Service相当のチェック）で有効と判定されることを確認する

要件:
- スコープ対象外（大会別・チーム別フィードの細分化）は実装しない
- 週次ガイド用の別フィードを実装するかはCodexの判断に委ねる。迷う場合は完了報告で質問として提示する

完了時:
- 実装内容、変更・新規ファイルを要約する
- 生成したフィードの検証結果を報告する
- 仕様書からの逸脱があれば理由を明示する
