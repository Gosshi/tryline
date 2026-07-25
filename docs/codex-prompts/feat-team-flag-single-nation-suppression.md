# Codex プロンプト: feat-team-flag-single-nation-suppression

**tryline リポジトリ**で貼る(仕様書: `specs/feat-team-flag-single-nation-suppression.md`)。モバイル側の変更は不要(`flag_code`がnullのとき国旗を出さない実装が既にテスト済み)。

---

`specs/feat-team-flag-single-nation-suppression.md` の仕様を実装してください。League One・Top 14のような単一国クラブリーグで、全チームに国代表と同じ国旗が付いてしまう問題を修正します。

コンテキスト:
- 対象ファイル: `lib/db/queries/matches.ts`(または`lib/db/queries/teams.ts`に新規関数)、`app/api/v1/calendar/route.ts`、`app/api/v1/competitions/[slug]/matches/route.ts`、`app/api/v1/matches/[id]/route.ts`、`app/api/v1/stories/route.ts`
- 判定は大会単位(参加チームの`country`が2種類以上あるか)で行う。個々の試合のhome/away国が一致するかではない(SRP内のNZ勢同士の対戦は大会全体では多国籍なので国旗を維持する)

やること:
- `getSingleNationCompetitionIds(competitionIds: string[]): Promise<Set<string>>`を新規実装する。大会ごとに、その大会の全試合に登場するチームの`country`の種類数を数え、1種類のみの大会IDを返す
- `calendar`・`competitions/[slug]/matches`・`matches/[id]`・`stories`の4ルートで、試合データ取得後にこの関数を呼び、対象大会の試合の`home_team.flag_code`/`away_team.flag_code`を`null`で上書きする
- `calendar`は複数大会の試合が混在するため、取得した試合群の大会ID一覧をまとめて`getSingleNationCompetitionIds`に渡す(大会ごとに個別クエリを繰り返さない)

エッジケース:
- countryがnullのチームは種類数のカウントから除外する(誤って「単一国」と判定してしまわないよう注意)
- 大会に試合が1件もない場合はSetに含めない(判定不能なので国旗は通常通り表示する側に倒す)

やらないこと:
- クラブロゴ・バッジの追加
- `teams.flag_code`列自体の変更

完了の定義:
- specs の受け入れ条件 1〜5 を満たす(6はOwnerがTestFlightビルドで確認するため、Codexは1〜5を満たした状態で報告する)
- `pnpm test` / `pnpm tsc --noEmit`(このリポジトリの該当コマンド)clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容・変更ファイルを要約する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
