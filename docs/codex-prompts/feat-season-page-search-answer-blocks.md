`/specs/feat-season-page-search-answer-blocks.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- FAQ構造化データの既存実装パターンは `app/pricing/page.tsx:81-91`（`pricingFaqJsonLd`）を参照する
- `feat-season-page-ia.md`（PR #454・実装済み）で確定した表示順序（順位表 → 試合一覧 → 大会ガイド折りたたみ）を変更しない。本 spec は追加のみ
- JST日時フォーマットは `lib/format/kickoff.ts` の `formatKickoffJstDate` / `formatKickoffJstTime` を使う（新規実装しない）

入出力の例:
- `/c/pnc/2026`（日本代表出場・次戦あり）→ FAQ JSON-LD 出力 + StandingsTable直後に「日本代表の次戦」ブロック表示
- `/c/six-nations/2026`（日本代表不出場）→ FAQ JSON-LD は出力されるが「日本代表の次戦」ブロックは非表示
- `/c/pnc/2027`（日本代表出場だが scheduled 試合が無いシーズン）→ 「日本代表の次戦」ブロック非表示、FAQ の該当質問の回答は「現在予定されている試合はありません。」

処理すべきエッジケース:
- 日本代表出場判定は大会名のハードコード分岐ではなく、`matches` 内に `homeTeam.slug === "japan" || awayTeam.slug === "japan"` の試合が実在するかで判定する（spec本文の通り。将来的に日本が新規大会に参加してもコード変更不要にするため）
- 視聴方法FAQの回答文言は spec記載の固定文言でよい（大会ごとの正確な配信元データが構造化されていないため。未解決の質問を参照）
- `matches` が0件のシーズン（`feat-season-page-ia.md` の空状態分岐）でも FAQ JSON-LD 自体は出力されること（「試合データを準備中です」の空状態表示とは独立して動作する）

完了の定義:
- specs の受け入れ条件 1〜8 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 日本代表出場大会（例: pnc）と非出場大会（例: six-nations）両方のスクリーンショットまたは HTML 抜粋を提示する

要件:
- 「スコープ対象外」（ハブページへの同様追加、FAQ文言の大会横断テンプレート化、feat-season-page-ia.md の表示順序変更）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
