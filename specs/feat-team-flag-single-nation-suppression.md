# feat-team-flag-single-nation-suppression: 単一国内リーグでは国旗を非表示にする

対象リポジトリ: **tryline(API)のみ**。`teams.flag_code`は既にnullable、モバイル側の`TeamIdentity`は`flag_code`がnullのとき国旗を出さず崩れない実装が既にテスト済みのため、**モバイル側の変更は不要**。

## 背景

Owner がTestFlightビルドを見て「リーグワンのようなクラブチームに日本代表と同じ日本国旗が全チームに付くのは不適切」と指摘した。

`supabase/migrations/20260716010000_add_team_flag_code.sql`は`teams.country`から機械的に`flag_code`をマッピングしており、国代表チームとクラブチームを区別していない。Super Rugby Pacific(NZ/豪州/フィジー/サモアなど実際に国が異なる)では国旗がチームを区別する情報として機能するが、League One(全クラブが日本拠点)・Top 14(全クラブがフランス拠点)のような単一国クラブリーグでは、全チームが同一の国旗になり、差別化情報がないばかりか「日本代表」であるかのような誤解を招く。

判定は大会単位で行う(個々の試合の home/away チームの国が偶然一致するかではなく、大会全体で複数の国のチームが参加しているかどうかで判定する。SRP内のNZ勢同士の対戦(例: HIG vs CRU)は大会全体では多国籍なので国旗を維持する)。

## スコープ

対象:
1. 大会(`competition_id`)ごとに、参加チームの`country`が2種類以上あるかを判定する仕組みを追加する
2. 単一国と判定された大会の試合については、レスポンスの`home_team.flag_code`/`away_team.flag_code`を`null`にする
3. 対象エンドポイント: `GET /api/v1/calendar`、`GET /api/v1/competitions/{slug}/matches`、`GET /api/v1/matches/{id}`、`GET /api/v1/stories`(すべて`V1CalendarMatch`または類似の試合オブジェクトを返すため、同じチーム国旗ロジックが必要)

対象外:
- クラブロゴ・クラブ独自バッジの追加(将来検討、今回はシンプルに「表示するかしないか」のみ)
- `teams.flag_code`列自体・マイグレーションデータの変更(既存データはそのまま、レスポンス生成時にnull化するだけ)
- モバイル側の変更(`flag_code`がnullのとき国旗を出さない実装は既存・テスト済み)

## データモデル変更

なし(既存の`teams.country`・`matches.competition_id`・`competition_teams`の参照のみ)。

## API サーフェス

- 新規関数(例: `lib/db/queries/teams.ts`または`lib/db/queries/matches.ts`に追加): `getSingleNationCompetitionIds(competitionIds: string[]): Promise<Set<string>>`
  - 引数の`competitionIds`それぞれについて、その大会の試合に登場する全チーム(home_team・away_team、`matches`テーブル経由で重複除去)の`country`の種類数を数える
  - 種類数が1(またはnullを除いて1)の大会IDだけを返り値のSetに含める
  - 大会横断で1回のクエリにまとめられるよう設計する(`calendar`は複数大会にまたがるため、試合を取得した後にその試合群が属する大会ID一覧をまとめて渡す)
- 各ルート(`calendar`・`competitions/[slug]/matches`・`matches/[id]`・`stories`)で、試合データ取得後に`getSingleNationCompetitionIds`を呼び、対象大会に属する試合の`home_team.flag_code`/`away_team.flag_code`を`null`で上書きしてからレスポンスを組み立てる
- キャッシュ: 既存の`PUBLIC_CACHE_CONTROL`のまま(大会の参加国構成は頻繁に変わらないため、追加のキャッシュ層は必須ではないが、パフォーマンス上気になる場合は`unstable_cache`(`lib/db/queries/competitions.ts`の既存パターン)を流用してよい)

## 受け入れ条件

1. League One(全チーム`country = 'Japan'`相当)の試合で、`home_team.flag_code`/`away_team.flag_code`がともに`null`になることを確認するテスト
2. Super Rugby Pacific(複数国混在)の試合で、`flag_code`が引き続き正しく返ることを確認するテスト(NZ勢同士の対戦を含めて、大会全体としては多国籍なので国旗を維持することを確認する)
3. Six Nations等、国代表チーム同士の大会では引き続き`flag_code`が正しく返ることを確認するテスト
4. `calendar`エンドポイントで複数大会の試合が混在する場合、大会ごとに正しく判定が分かれることを確認するテスト
5. TypeScript strict・test green
6. **Owner目視**: TestFlightビルドでリーグワンの試合一覧から国旗が消え、SRPでは引き続き表示されることを確認する

## 未解決の質問

なし。
