`/specs/fix-home-archive-latest-season-priority.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 対象関数は `lib/db/queries/competitions.ts` の `selectLatestSeasonWithMatches`。呼び出し元は `app/page.tsx` のみ（他に呼び出し箇所は無いことを確認済み。関数のインターフェース自体は変更しないため呼び出し元の修正は不要）
- 既存の単体テストは `tests/competition-latest-season.test.ts`

入出力の例:
- `[{season:"2026",matchCount:12,publishedContentCount:0}, {season:"2025",matchCount:21,publishedContentCount:3}, {season:"2024",matchCount:20,publishedContentCount:8}]` → 変更前は `"2025"` を返していたが、変更後は `"2026"` を返す（試合データがあれば公開コンテンツの有無を問わず最新シーズンを優先）
- `[{season:"2026",matchCount:0,...}, {season:"2025",matchCount:21,...}]` → 引き続き `"2025"`（matchCount>0 の最新シーズン）
- `[{season:"2026",matchCount:0,...}, {season:"2025",matchCount:0,...}]` → 引き続き `"2026"`（フォールバックで単純に最新シーズン）

処理すべきエッジケース:
- `tests/competition-latest-season.test.ts` の1件目のテストケース（「prefers the latest season that has published content」）の期待値を `"2025"` → `"2026"` に更新し、テスト名も新しい優先順位を表す名前（例: 「prefers the latest season that has matches even without published content」）に変更する。残り2件は変更不要
- `tests/app/home-page.test.tsx` / `tests/app/competition-guide-metadata.test.ts` でも `selectLatestSeasonWithMatches` を間接的に使うモック・アサーションがあれば、新しい優先順位で壊れていないか確認する

完了の定義:
- specs の受け入れ条件 1〜6 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean

要件:
- 「スコープ対象外」（大会アーカイブのレイアウト変更、シーズンページのリダイレクトロジック、publishedContentCountフィールド自体の削除）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
