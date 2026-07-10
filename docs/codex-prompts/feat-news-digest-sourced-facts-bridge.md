`/specs/feat-news-digest-sourced-facts-bridge.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 実際のダイジェストファイル`docs/notes/news-digest-2026-07-10.md`を読み、実データのフォーマット（見出し構造・事実ブロックの正規表現パターン）を確認すること。将来のダイジェストも同じフォーマット規約に従う想定でよい
- `lib/llm/sourced-facts/allowlist.ts`の`isAllowedSourcedFactDomain`・`normalizeSourcedFactDomain`をそのまま再利用すること（重複実装しない）
- `lib/llm/sourced-facts/fetch.ts`の`match_sourced_facts`への書き込み部分（`upsert`, `onConflict: "match_id,fact"`）と同じパターンを踏襲すること
- 試合特定のためのチーム名・キックオフ日時のクエリは、既存の`lib/db/queries/matches.ts`のクエリパターンを参考にすること

入出力の例:
- `docs/notes/news-digest-2026-07-10.md`の「日本 vs アイルランド」セクションにある「日本代表の先発は...」という事実（出典: rugby-japan.jp、確度: 公式発表）→ `rugby-japan.jp`は許可ドメイン外なので実際には除外される想定（現在の許可リストには含まれていないため）。この場合、ドライラン結果に除外理由付きで表示されることを確認する
- 逆に、もしダイジェストが`bbc.com`や`planetrugby.com`を出典とする事実を含んでいれば、それは許可ドメイン内として取り込まれ、日本vsアイルランド戦の`match_id`に紐付いて`match_sourced_facts`に保存される想定

処理すべきエッジケース:
- 見出しのチーム名表記（日本語）が`teams`テーブルの`name`と完全一致しない場合（例: 表記ゆれ）の扱いに迷う場合、完了報告で質問として提示する
- 同じ試合について複数の事実ブロックがある場合、それぞれ個別の行として保存する
- ダイジェストファイルの「事実」ブロック以外（マッチアップ解説・X reply素材候補等）は取り込み対象外とする

完了の定義:
- specs の受け入れ条件 1〜5 をすべて満たす（受け入れ条件6の本番書き込みはOwnerが別途行うため対象外）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 実際の`docs/notes/news-digest-2026-07-10.md`を使った`--dry-run`実行結果（抽出件数・マッチした試合・除外件数）を完了報告に含める

要件:
- スコープ対象外（ダイジェスト生成ルーティンの変更、許可ドメインリストへの追加、完全自動化）は実装しない
- 実装方針に迷う場合は完了報告で質問として提示する

完了時:
- 実装内容、変更・新規ファイルを要約する
- `--dry-run`の実行結果（抽出件数・除外件数・除外理由の内訳）を報告する
- 仕様書からの逸脱があれば理由を明示する
