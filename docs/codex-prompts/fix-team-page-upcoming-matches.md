`specs/fix-team-page-upcoming-matches.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む
- 先行 spec `specs/fix-team-page-title-and-broadcast.md` は実装済み。`nameJa` は既に `TeamRow` → `TeamDetail` → `getTeamPageDataBySlug` の全経路を通っており、`generateMetadata` で使われている（`app/teams/[slug]/page.tsx:60-61`）。DB からの伝播作業は不要で、**本文で使うだけ**の作業
- 変更対象は次の2ファイルのみ:
  - `app/teams/[slug]/page.tsx`（セクション順序の入れ替え、`nameJa` の使用）
  - `lib/db/queries/teams.ts`（`getTeamUpcomingMatches` の既定 limit を 5 → 30）
- セクション移動は JSX ブロックの位置入れ替えのみ。次戦セクション（現行 177〜216 行）を直近の試合セクション（現行 156〜175 行）より前に動かす。中身（放送バッジの描画を含む）は一切変更しない
- `nameJa` の適用箇所は3つだけ。現行 108 行（パンくず末尾）・130 行（H1）・141 行（`FavoriteTeamFollowButton` の `teamName`）。いずれも `data.team.name` → `data.team.nameJa ?? data.team.name`

エッジケース:
- `name_ja` が null のチーム（クラブチームの多くが該当）で英語名にフォールバックすること。`??` を使い `||` は使わない（null 判定に限定する）
- 予定試合が0件のチームで、次戦セクションの見出しごと描画されないこと（現行の `upcomingMatches.length > 0` の条件分岐を維持する）
- 次戦セクション内の放送バッジは `MatchCard` の**外側**の要素として描画されている。移動時にこの構造を壊すと `<a>` のネストが発生するので、ラッパー `<div className="space-y-2">` ごと移動する
- limit を 30 にしても `loadMatchesByTeamId` の `.gte("kickoff_at", afterIso)` が `.limit()` より前に適用される順序を崩さないこと（現行 178〜184 行の順序を維持）

やらないこと:
- `generateMetadata` の title / description の変更（先行 spec の成果。そのまま維持する）
- `components/match-card.tsx` の変更
- `TeamStatsPanel` / `TeamPlayersSection` の変更
- `TeamBadge` の `shortCode`、`data.team.country` の表示、`toMatchCardItem` の `shortCode` フォールバックの変更
- `match_broadcasts` へのデータ投入
- `matches.venue` の日本語化・Wikipedia 脚注（`Cardiff[9]` 等）の除去
- 選手名の日本語表記、トップスコアラーの重複統合
- 日本代表専用のハードコード。全チーム共通のロジックのままにする

完了の定義:
- spec の受け入れ条件1〜9をすべて満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- ローカルで `/teams/japan` を開き、次戦セクションに 11/7 ウェールズ戦・11/14 イングランド戦・11/21 スコットランド戦の3件が含まれること、および次戦セクションが直近の試合より上にあることをスクリーンショットで確認して報告する
- `name_ja` が null のチームのページも開き、英語名で正常表示されることを確認して報告する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
