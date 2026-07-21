`/specs/feat-competition-hub-post-tournament-navigation.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- `app/c/[competition]/[season]/page.tsx`の`SeasonSummaryBand`は既に次戦・首位・日本代表の次戦の3タイルを状態適応で表示する仕組みがある
- **重要な訂正**: 当初「シーズン内の次戦がnullのときだけ大会横断検索」という設計だったが、これは誤り。Nations Championship 2026は11月に日本代表戦が残っているため、シーズン内next matchはnullにならず、より早い8月の別大会の試合が埋もれてしまう。正しくは「常に大会横断で取得し、シーズン内の次戦と比較して早い方を採用する」
- `feat-featured-competition-auto-selection.md`側で共通関数`getNextMatchForTeamSlug(teamSlug, afterIso)`（`lib/db/queries/matches.ts`にexport）を実装する設計になっている。本specはそれを再利用する（実装順序次第でこちらが先行実装するケースもあるが、いずれにせよ1箇所の共通関数に統一する）

やること:
- `SeasonSummaryBand`に「最新レビュー」タイルを追加する: `matches`のうち`status === "finished"`かつ`hasRecap === true`の試合の中から`kickoffAt`が最大のものを明示的に選び（配列の並び順に依存しない）、`/matches/{id}`へのリンクとして表示する
- 「日本代表の次戦」タイルのロジックを変更する: `hasJapanInSeason === true`のとき常に`getNextMatchForTeamSlug("japan", 現在時刻)`を呼び、シーズン内の次戦と比較して早い方を採用する。採用した試合が現在の大会と異なる場合のみ、secondaryラベルに大会名を添える
- `SeasonSummaryBand`のグリッドを、最大4タイル（次戦・首位・最新レビュー・日本代表の次戦）に対応するレイアウトに調整する

処理すべきエッジケース:
- `hasJapanInSeason === false`の大会では日本代表次戦タイルの拡張ロジックを発動しない
- シーズン内の次戦と大会横断の次戦が同じ試合を指す場合、重複せず1つのタイルとして扱う
- テストは固定の基準時刻を使い、現在時刻に依存しない形で書く

完了の定義:
- specの受け入れ条件1〜8を満たす（8番目のOwner目視確認は、実装後にスクリーンショットを添えて報告し、Owner確認を待つ形でよい）
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- 「次戦」「首位」タイルの選定・表示ロジック自体は変更しない。ただし「最新レビュー」追加と「日本代表の次戦」の大会横断化は、開催前・開催中・開催後を問わず全状態に適用する（Nations Championship 2026は現在「開催中」であり、まさにこの状態で機能する必要がある）
- 大会ページ全体のレイアウト再設計はしない（グリッドのカラム数調整のみ）
- `getNextMatchForTeamSlug`が既に他specで実装済みならそれを再利用し、重複実装しない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 固定の基準時刻でテストし、Nations Championship 2026のハブページで「最新レビュー」「日本代表の次戦(リポビタンDチャレンジカップ2026、8/8対オーストラリア)」タイルが正しく表示されることを確認したスクリーンショットを添付する
- `feat-featured-competition-auto-selection.md`との共通関数の扱いを報告する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
