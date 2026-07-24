# feat-mobile-competition-match-list: 大会詳細画面に試合一覧を追加

対象リポジトリ: **tryline(API) + tryline-mobile(UI)**。2段階(API→UI)で、Codexプロンプトも2本に分ける。

## 背景

Owner がTestFlightビルドで`fix-mobile-competition-detail-empty-standings`(順位表が無い大会に空状態メッセージを出す修正)を確認した際、「大会詳細画面は順位表だけでなく試合一覧も出るべきでは」と指摘した。確認したところ、順位表の有無に関わらず`app/(tabs)/competitions/[slug].tsx`は`/competitions/{slug}/standings`しか呼んでおらず、そもそも大会の試合一覧を表示する手段がなかった。

調査の結果、web側には大会の全試合を取得する`listMatchesForCompetition(competitionSlug: string): Promise<MatchListItem[]>`(`lib/db/queries/matches.ts:2201`)が既に存在する(Web大会ハブページ`/c/[comp]`で使用中)。これをラップするAPIエンドポイントを追加すれば、モバイル側は新規コンポーネントを作らずに既存の`MatchCard`(`src/components/MatchCard.tsx`、`V1CalendarMatch`を受け取る)をそのまま再利用できる。

「大会概要」文言の追加は今回のスコープ外(新規コンテンツの執筆が必要なため、別途検討)。

## スコープ

対象:
1. **(tryline / API)** 新規エンドポイント `GET /api/v1/competitions/{slug}/matches` を追加。大会の全試合を`V1CalendarMatch[]`と同じ形状で返す
2. **(tryline-mobile / UI)** `app/(tabs)/competitions/[slug].tsx`に、順位表(またはempty state)の下に試合一覧セクションを追加する。各試合は既存の`MatchCard`で描画する

対象外:
- 大会概要文言の追加(新規コンテンツが必要、別spec)
- 大会一覧画面(`index.tsx`)の変更
- 試合一覧のページネーション・絞り込みUI(「未解決の質問」参照)

## データモデル変更

なし(既存の`listMatchesForCompetition`・`matches`/`teams`テーブルの参照のみ)。

## API サーフェス(tryline)

- 新規: `GET /api/v1/competitions/{slug}/matches`
  - `lib/db/queries/competitions.ts`の`getCompetitionBySlug(slug)`で大会の存在確認(存在しなければ`app/api/v1/competitions/[slug]/standings/route.ts`と同様に404)
  - `lib/db/queries/matches.ts`の`listMatchesForCompetition(slug)`で試合一覧を取得
  - レスポンス形状は`V1CalendarMatch`と同一にする(`lib/api/v1/types.ts`の既存型を再利用、モバイル側で`MatchCard`をそのまま使うため)。`app/api/v1/calendar/route.ts`の80〜113行目のマッピング(`home_team`/`away_team`に`flag_code`を含める、`competition`・`has_preview`/`has_recap`/`broadcast_jp_url`/`has_broadcasts`を埋める)と同じ手順を踏む
  - **注意**: `listMatchesForCompetition`の現在のSupabase select文(`lib/db/queries/matches.ts:2201`付近)は`teams`から`slug, name, short_code`のみを取得しており`flag_code`を含まない。`flag_code`をselectに追加する(`getMatchesInRange`系のクエリでの取得方法を参考にする)
  - `content_status`(`getContentStatusForMatches`、`lib/db/queries/match-content.ts`)・`broadcast_jp_url`/`has_broadcasts`(`getBroadcastUrlsForMatches`/`getV1BroadcastsForMatches`、`lib/api/v1/server.ts`)は`calendar/route.ts`と同じ関数を呼んで埋める
  - レスポンス型: `{ matches: V1CalendarMatch[] }`(新規型`V1CompetitionMatchesData`を`lib/api/v1/types.ts`に追加)
  - キャッシュ: `PUBLIC_CACHE_CONTROL`(既存の他大会系エンドポイントと同じ)

## UI サーフェス(tryline-mobile)

- `src/api/client.ts`に`competitionMatches: (slug: string) => request<V1CompetitionMatchesData>(`/competitions/${slug}/matches`)`を追加(`V1CompetitionMatchesData`を`src/api/types.ts`にも追加)
- `app/(tabs)/competitions/[slug].tsx`に`useQuery(["competition-matches", slug], () => trylineApi.competitionMatches(slug))`を追加
- 既存の順位表(プール別テーブル/単一テーブル/空状態)セクションの**下**に、見出し(例: 「試合日程」)+ `matches.map((match) => <MatchCard key={match.id} match={match} />)` を追加
- 試合取得のローディング/エラーは、既存の`LoadingState`/`ErrorState`パターンをこのセクション用に個別に出す(順位表セクションとは独立して読み込み状態を扱ってよい。順位表が先に表示され、試合一覧が後から出ても問題ない)

## 受け入れ条件

1. **(tryline)** `/api/v1/competitions/{slug}/matches`が存在する大会に対して`V1CalendarMatch`形状の配列を返すことを確認するテスト(`flag_code`・`competition`・`has_preview`/`has_recap`が正しく埋まっていること含む)
2. **(tryline)** 存在しないslugに対して404を返すことを確認するテスト
3. **(tryline-mobile)** 大会詳細画面に試合一覧セクションが表示され、各試合が`MatchCard`で描画されることを確認するテスト
4. **(tryline-mobile)** 試合が0件の大会(開幕前シーズン等)では試合一覧セクションが空状態またはセクション非表示になることを確認するテスト
5. 両リポジトリで TypeScript strict・lint・test green
6. **Owner目視**: TestFlightビルドで、順位表がある大会(例: プレミアシップ)と無い大会(例: オータムネーションズシリーズ)の両方で、試合一覧が正しく表示されることを確認する

## 未解決の質問

- `listMatchesForCompetition`は大会の**全試合**を返す(URC等は150試合)。一覧をそのまま全件描画するか、直近の試合を中心に絞る(例: 直近5件+「もっと見る」)かはOwnerの判断が必要。今回のspecでは**全件表示**をデフォルトとするが、実機確認で長すぎると感じた場合は絞り込みを別specで追加する
- 試合一覧の並び順は`listMatchesForCompetition`の`kickoff_at ascending`(古い順)をそのまま使うか、直近/新しい試合を先に見せるため降順にするかもOwner判断。デフォルトは現状のクエリ順(昇順)のままとする
