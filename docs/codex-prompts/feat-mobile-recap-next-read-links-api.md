# Codex プロンプト: feat-mobile-recap-next-read-links (API段階)

**tryline リポジトリ**で貼る(仕様書: `specs/feat-mobile-recap-next-read-links.md`)。この後に続くUI段階(`tryline-mobile`向け)より**先に**実装・マージすること。`feat-mobile-match-detail-related-news`のAPI段階とは独立(順不同・並行可)。

---

`specs/feat-mobile-recap-next-read-links.md` の「API サーフェス(tryline)」節を実装してください。試合詳細APIに「次に読む」導線用のデータを追加する変更です。

コンテキスト:
- 対象: `app/api/v1/matches/[id]/route.ts`、`lib/api/v1/types.ts`
- 既存の再利用可能な関数: `getRelatedPublishedRecapsForMatch()`(`lib/db/queries/matches.ts:1401`)、`getNextMatchesForTeams()`(`lib/db/queries/matches.ts:1278`)。いずれも新規実装ではなく既存関数の呼び出し・レスポンスマッピングが中心

やること:
- `V1NextReadMatch`型を新規定義(`id`/`home_team`/`away_team`/`kickoff_utc`/`competition_name`/`has_recap`)
- `V1MatchDetail`に`related_recaps: V1NextReadMatch[]`と`next_team_matches: V1NextReadMatch[]`を追加
- `matches/[id]/route.ts`で`getRelatedPublishedRecapsForMatch({ competitionSlug, excludeMatchId: id, round })`と`getNextMatchesForTeams({ teamIds: [homeTeamId, awayTeamId], afterIso: kickoffAt, excludeMatchId: id })`を呼び出し、`V1NextReadMatch[]`へマッピングする
- `related_recaps`に含まれる試合は`next_team_matches`から除外する(重複排除)

エッジケース:
- 該当データがない場合はそれぞれ空配列(null不可)
- `getNextMatchesForTeams`は2チーム分呼ぶ必要があるが、同じ試合が両チームの次戦として重複して返る場合は1件にまとめる

完了の定義:
- specs の受け入れ条件 1〜3(tryline側)を満たすテストを追加
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容・変更ファイルを要約する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
