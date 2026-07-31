# モバイル: お気に入りチームの次戦をホーム最上部に表示

## 背景

モバイル総合監査(2026-07-25、複数回)で繰り返し挙がった提案。お気に入りチームを設定したユーザーが、次にそのチームがいつ試合をするか(今週の範囲外でも)を一目で確認できるようにする。「お気に入りの次戦まで○日」表現の本格対応。

必要なAPIは `specs/feat-favorite-team-next-match-api.md`(`GET /api/v1/me/next-matches`)で追加済みの前提。**このspecはWeb側APIがマージされてから着手すること**。

## スコープ

対象:
- ホーム画面(`app/(tabs)/index.tsx`)に新規セクション `FavoriteNextMatchCard`(名称はCodexの判断でよい)を追加する
- 配置は `Rwc2027Banner`(99行目付近)と `MatchStoriesSection`(100行目付近)の間
- ログイン済み・お気に入りチーム設定済みで、`GET /api/v1/me/next-matches` が1件以上返す場合のみ表示する。それ以外(未ログイン・お気に入り未設定・0件)は何も表示しない(既存レイアウトに影響を与えない)
- 表示内容: 対戦カード(ホーム/アウェイチーム名・国旗、大会名、キックオフ日時)+「あと○日」のカウントダウン表現
- タップで該当試合の試合詳細画面へ遷移する(既存の `Link href={\`/matches/${match.id}\`}` パターンを踏襲、`src/components/MatchCard.tsx` 参照)
- 複数の次戦が返ってきた場合(お気に入り2〜3チームでそれぞれ別の次戦がある場合)、**最も近い1件のみ**をこのカードに表示する(スコープを1枚のカードに限定する)

対象外:
- 複数の次戦をカルーセル等で全件表示すること(最初の1件のみ)
- プッシュ通知(「次戦が近づいたら通知」等)との連動
- ホーム画面以外の画面(試合詳細・大会詳細等)への同種カード追加
- Web側の同機能実装(モバイルのみ。Web側は既存の `feat-favorite-team-follow-engagement.md` の応援チーム導線と別軸のため、このspecでは扱わない)

## データモデル変更

なし。

## API サーフェス

なし(新規)。`specs/feat-favorite-team-next-match-api.md` で追加される `GET /api/v1/me/next-matches` を呼び出すだけ。`src/api/client.ts` に `trylineApi.nextMatches(accessToken)` を追加し、`src/api/types.ts`(`reference/api-types.ts` からの同期)に `V1NextMatchesData` を反映する。

## UI サーフェス

- 新規コンポーネント: `FavoriteNextMatchCard`(配置場所はCodexの判断。既存 `MatchCard.tsx` のチーム表示ロジックを再利用できないか検討し、無理に共通化せず新規でよい)
- ローディング中は何も表示しない(スケルトンは不要、既存の `MatchStoriesSection` 等のローディング挙動と揃える必要はない)
- エラー時は静かに非表示(トップ画面の他の要素に影響を与えない。エラーバナー等は出さない)

## 受け入れ条件

1. お気に入りチーム設定済み・次戦ありのユーザーには、ホーム画面の `Rwc2027Banner` と `MatchStoriesSection` の間に次戦カードが表示される
2. カードには対戦カード情報(チーム名・大会名・キックオフ日時)と「あと○日」のカウントダウンが表示される
3. カードをタップすると該当試合の試合詳細画面に遷移する
4. お気に入りチーム未設定・未ログイン・次戦0件のいずれの場合もカードは表示されず、既存レイアウトに変化がない
5. 複数の次戦がある場合、最も近い1件のみが表示される
6. `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
7. 本番相当のTestFlightビルドはOwner承認後に別途実施する

## 未解決の質問

- カウントダウン表現(「あと3日」「7/29開催」等)の具体的な文言・切り替え閾値はCodexの判断に委ねる
- `reference/api-types.ts` の同期漏れが過去に発生した実績があるため(`feedback_api_types_sync`)、Web側spec実装後に型定義が最新か必ず確認すること
