# Codex プロンプト: feat-mobile-competition-match-list (API段階)

**tryline リポジトリ**で貼る(仕様書: `specs/feat-mobile-competition-match-list.md`)。この後に続くUI段階(`tryline-mobile`向け)より**先に**実装・マージすること。

---

`specs/feat-mobile-competition-match-list.md` の「API サーフェス(tryline)」節を実装してください。大会単位の試合一覧を返す新規エンドポイントです。

コンテキスト:
- 新規: `GET /api/v1/competitions/{slug}/matches`
- 参考実装: `app/api/v1/competitions/[slug]/standings/route.ts`(大会存在確認・404パターン)、`app/api/v1/calendar/route.ts`の80〜113行目(`V1CalendarMatch`へのマッピング方法)
- 既存の`lib/db/queries/matches.ts`の`listMatchesForCompetition(slug)`(2201行目付近)を使う。ただし現在のSupabase select文は`teams`の`slug, name, short_code`のみ取得しており`flag_code`を含まないので、selectに`flag_code`を追加する

やること:
- `lib/api/v1/types.ts`に`V1CompetitionMatchesData`(`{ matches: V1CalendarMatch[] }`)を追加する(`V1CalendarMatch`は既存の型をそのまま再利用)
- `app/api/v1/competitions/[slug]/matches/route.ts`を新規作成する:
  - `getCompetitionBySlug(slug)`で存在確認、なければ404(`apiError`)
  - `listMatchesForCompetition(slug)`で試合一覧取得
  - `getContentStatusForMatches`(`lib/db/queries/match-content.ts`)・`getBroadcastUrlsForMatches`/`getV1BroadcastsForMatches`(`lib/api/v1/server.ts`)で`has_preview`/`has_recap`/`broadcast_jp_url`/`has_broadcasts`を埋める(`calendar/route.ts`と同じ手順)
  - `competition`フィールドは呼び出し済みの大会情報(`getCompetitionDisplayName`等)から埋める
  - `PUBLIC_CACHE_CONTROL`でレスポンスを返す

エッジケース:
- 大会に試合が0件(開幕前シーズン等)の場合、`matches: []`を返す(エラーにしない)
- 存在しないslugは404

やらないこと:
- `listMatchesForCompetition`の呼び出しロジック自体の変更(selectへの`flag_code`追加以外は変更しない)
- ページネーション・絞り込みパラメータの実装(仕様書「未解決の質問」参照、今回は全件返す)

完了の定義:
- specs の受け入れ条件 1〜2 を満たす
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint`(このリポジトリの該当コマンド)clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容・変更ファイルを要約する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
