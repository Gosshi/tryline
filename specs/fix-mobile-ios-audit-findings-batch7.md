# fix-mobile-ios-audit-findings-batch7: 再々監査の残件2件+チーム名表示

対象リポジトリ: **tryline-mobile**のみ。`fix-mobile-ios-audit-findings-batch1`〜`batch6`の後続。API・データモデル変更は不要。

## 背景

`fix-mobile-ios-audit-findings-batch6`の再々監査で、4件中2件が未修正/部分修正のままだった。あわせて、Owner実機確認で「大会一覧の試合一覧(略称のみ表示)が分かりづらい」と指摘された。

- **共有中の自動送り(#9)が再々監査でも未修正**: PREVIEWで共有シートを開いたまま約8秒待つと、背後がRESULTまで進んだ。GPTの分析: 現在は`AppState`側と`shareCurrentStory`の`finally`側が同じ`paused`変数を奪い合っており、共有シートが開いたままでも`finally`側やAppStateの別遷移が`false`で上書きしてしまう可能性がある。一時停止の理由(共有中/AppState/ジェスチャー)を別々の状態として持ち、いずれか1つでも真なら一時停止する設計に変える必要がある
- **試合詳細ヘッダー直下の空白(#13)が部分修正**: 前回の約70pxから約56pxへ縮小したが、まだ残っている。GPTの分析: 負のmarginをさらに増やす対症療法ではなく、`Screen`/`ScrollView`側でこの画面だけ上部のcontent insetを無効化する(full-bleed)方が安定する
- **試合一覧のチーム表示が略称のみで分かりづらい**: `src/components/MatchCard.tsx`は`TeamIdentity`を`showName`なしで呼んでおり、`HIG`・`CRU`のような3文字略称しか表示されない。`TeamIdentity`は既に`showName`propを持っており(`MatchDetailScreen.tsx`のmastheadでは使用済み)、`MatchCard`側で渡していないだけ

## スコープ

対象:
1. `src/stories/MatchStoriesSection.tsx`: 一時停止の理由を独立した状態として管理し直す(共有中フラグ・AppStateフラグ・ジェスチャーフラグのいずれかが真なら一時停止とする)
2. `src/matches/MatchDetailScreen.tsx`: masthead上部の空白を、負のmargin調整ではなく、この画面の`Screen`/`ScrollView`のcontent inset自体を無効化する方式に変更する
3. `src/components/MatchCard.tsx`: `TeamIdentity`の呼び出しに`showName`を追加し、試合一覧でもチームのフルネームが表示されるようにする

対象外:
- 国旗表示ロジック(`feat-team-flag-single-nation-suppression`、tryline側の別spec)
- 大会名の改行品質(カタカナ途中改行、GPTは「機能上は合格」としているため今回は見送り)

## UI サーフェス

### 一時停止理由の独立管理(`MatchStoriesSection.tsx`)

- 現在の単一`paused` boolean stateを、複数の一時停止理由を保持できる形に変更する。実装例: `pauseReasons`を`Set<"share" | "appState" | "gesture">`のような状態にし、`paused = pauseReasons.size > 0`として自動送りの判定に使う
- `shareCurrentStory`は共有開始時に`"share"`理由を追加、`finally`で`"share"`理由だけを削除する(他の理由が残っていれば一時停止のまま)
- `AppState`監視は`"appState"`理由の追加/削除のみを行う
- ジェスチャー(長押し・パン操作)は`"gesture"`理由の追加/削除のみを行う
- どの理由も、他の理由を上書き・消去しないようにする(これが今回の再発の原因)

### mastheadのfull-bleed化(`MatchDetailScreen.tsx`・`app/matches/[id].tsx`)

- `app/matches/[id].tsx`が`Screen showHeader={false}`を使っている現在の構成を見直し、この画面(試合詳細)だけmastheadがヘッダー直下(Safe Area区切り線のすぐ下)から始まるようにする。`Screen`コンポーネント自体を変更してもよいし(新しいprop、例: `disableTopInset`を追加)、`app/matches/[id].tsx`側で`Screen`を使わず`SafeAreaView`を直接組んでもよい。既存のspacing.lgの負のmarginによる対症療法は撤去し、根本的にcontent inset自体を無くす
- 他の画面(`Screen`を使う全画面)の余白には影響しないこと

### 試合一覧にチーム名を表示(`src/components/MatchCard.tsx`)

- `<TeamIdentity team={match.home_team} .../>`・`<TeamIdentity align="right" team={match.away_team} .../>`の両方に`showName`を追加する
- 行の高さが増える分、`MatchCard`が連続する際のレイアウト(罫線区切り)が崩れないことを確認する

## データモデル変更 / API サーフェス / LLM 連携

なし。

## 受け入れ条件

1. 共有シートを開いている間、`AppState`が変化しても一時停止状態が維持され、共有シートを閉じたときだけ再開することを確認するテスト(一時停止理由が複数ある状態から1つだけ解除しても一時停止のままであることを含む)
2. `MatchDetailScreen`の画面(`app/matches/[id].tsx`経由)で、mastheadがcontent inset無効化によって上部の余白なく描画されることを確認するテスト(他画面の`Screen`利用箇所には影響しないことも確認する)
3. `MatchCard`で`TeamIdentity`が`showName`付きで呼ばれ、チーム名が表示されることを確認するテスト
4. TypeScript strict・lint・test green
5. **Owner目視**: TestFlightビルドで、共有シートを数秒間開いたままにしても自動送りが進まないこと、試合詳細のヘッダー直下の空白が解消されていること、試合一覧でチーム名が読めることを確認する

## 未解決の質問

なし。
