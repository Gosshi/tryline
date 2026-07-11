`/specs/feat-expand-sourced-facts-allowlist.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- `lib/llm/sourced-facts/allowlist.ts`の`OFFICIAL_DOMAINS`・`MEDIA_DOMAINS`配列に、それぞれ指定のドメインを追加するだけのシンプルな変更です
- 既存のテストファイル（`isAllowedSourcedFactDomain`のテスト、`grep -rln "isAllowedSourcedFactDomain" tests/`で確認）の既存パターンに倣ってテストケースを追加すること

入出力の例:
- `isAllowedSourcedFactDomain("rugby-japan.jp")` → `true`
- `isAllowedSourcedFactDomain("www.espn.com")` → `true`（`normalizeSourcedFactDomain`によるwww除去後の判定）
- 既存の非許可ドメイン（例: 許可リストに無い任意のドメイン）の判定結果に変化がないこと

処理すべきエッジケース:
- 特になし（配列への追加のみ）

完了の定義:
- specs の受け入れ条件 1〜3 をすべて満たす（受け入れ条件4の本番デプロイはOwnerが別途行うため対象外）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean

要件:
- スコープ対象外（指定7ドメイン以外の追加、ダイジェストインポートスクリプトの再実行、検索意図の変更）は実装しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
