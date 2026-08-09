# feat-mobile-score-progression-graph: 試合詳細への得点推移グラフ追加

対象リポジトリ: **tryline-mobile** のみ(API・データモデル変更なし)。

## 背景

Web版(`components/match-events-section.tsx`)には`ScoreGraph`(`components/score-graph.tsx`)による得点推移のラインチャートがあるが、モバイル版の試合詳細(`MatchDetailScreen.tsx`)はイベントを分・選手名・種別のフラットなリストで表示するだけで、累積スコアの推移が見えない。Web版の計算ロジック(`lib/format/match-timeline.ts`の`buildScoreTimeline`)は純粋関数でDOM非依存のため、モバイルへの移植が可能。API側の変更は不要(`V1MatchEvent`に既に`minute`/`player_name`/`points`/`team_id`/`type`/`is_penalty_try`が揃っている)。

React Nativeには標準のSVG描画機能がないため、Web版と同等のグラフを描くには新規ネイティブ依存(`react-native-svg`)の追加が必要(Owner確認・承認済み)。

## スコープ

対象:
1. `buildScoreTimeline`相当のロジックを`tryline-mobile`へ移植する(`src/matches/scoreTimeline.ts`目安)。Web版のロジック(得点イベントの抽出・時刻順ソート・累積計算・`points`欠損時のフォールバック計算)を、モバイルの`V1MatchEvent`(snake_case)に合わせて移植する
2. `react-native-svg`を新規依存として追加する
3. 試合詳細画面のイベントタイムライン`Card`内に「得点推移」グラフを追加する。ホームチーム=`colors.ink`、アウェーチーム=`colors.accent`の2色ラインチャート。横軸は分、縦軸はスコア
4. ネタバレガード: 既存のイベントタイムラインと同じ`isRevealed`条件でグラフもガードする(未開示の間はグラフも非表示)

対象外:
- チーム固有カラー(Web版`lib/format/team-identity.ts`の`TEAM_IDENTITY`マップの移植)。ホーム/アウェーの2色固定で十分とする
- グラフのタップ操作によるツールチップ等のインタラクション(v1は静的表示のみ)
- 前後半の区切り線・追加装飾(Web版にある80分基準線を踏襲するかはCodexの裁量)

## データモデル変更 / API サーフェス

なし。

## UI サーフェス

- 新規コンポーネント`src/matches/ScoreGraph.tsx`(仮): `react-native-svg`の`Svg`/`Path`/`Circle`/`Line`/`SvgText`等を使い、Web版と同等のライン+得点マーカー構成を再現する
- 配置: イベントタイムライン`Card`内、見出し「イベント」の下(グラフが先かリストが先かはCodexの裁量。両方が同じ`Card`内に収まる形を想定)
- データ: `match.events`と`match.home_team.id`から`buildScoreTimeline`でタイムラインを算出し`ScoreGraph`へ渡す
- 得点イベントが1件もない試合(0-0のまま、またはイベント自体が空)ではグラフを描画しない

## 受け入れ条件

1. `buildScoreTimeline`相当の関数が、Web版と同じ入力パターン(try/conversion/penalty_goal/drop_goal、penalty try判定)で同じ累積スコアタイムラインを返すことを確認するユニットテスト
2. `points`フィールドが欠損しているイベントでも、種別からのフォールバック計算(try=5点・penalty try=7点・conversion=2点・penalty_goal/drop_goal=3点)で正しい点数が計算されることを確認するテスト
3. 得点イベントがある試合詳細でグラフが表示されることを確認するテスト
4. 得点イベントが無い試合、またはイベント自体が無い試合詳細ではグラフが表示されないことを確認するテスト
5. ネタバレガード有効・未開示の間はグラフが表示されないことを確認するテスト(既存のイベントタイムラインと同じ挙動)
6. TypeScript strict・lint・test green
7. **Owner 目視**: 実機または iOS Simulator でグラフの見た目・データの正確性・ローカルSimulatorビルド及びEAS本番ビルド双方が問題なく通ることを確認する

## 未解決の質問

- チーム固有カラーの導入(Web版`TEAM_IDENTITY`の移植)は本specでは対象外。将来的に必要になればOwnerが別途判断する
- `react-native-svg`追加によりネイティブビルドの依存関係が増える。ローカルSimulatorビルド・EAS本番ビルド双方で問題なく動くことを実装後に確認する(過去に`babel-preset-expo`・`expo-modules-autolinking`でpnpm strict解決の問題が発生した実績があるため、同様の問題が起きないか注意する)
