# feat-mobile-match-detail-compact-header: 試合詳細スクロール時のコンパクトスコアヘッダー

対象リポジトリ: **tryline-mobile** のみ(API・データモデル変更なし)。

## 背景

GPT監査(2026-07-23)提案④: 長いプレビュー/レビュー記事をスクロールすると、読んでいる試合の対戦カードとスコアが画面外に消え、文脈を見失う。マストヘッド(`match-masthead-card`)が画面上端を越えてスクロールされた際に、ナビゲーション直下へ短い「欄外見出し」を表示し、文脈を保持したまま記事を読み進められるようにする。

## スコープ

対象:
1. 試合詳細画面にスクロール位置追従のコンパクトヘッダーを追加する。マストヘッド(`match-masthead-card`)が画面上端より上にスクロールされた時にのみ表示する
2. 表示内容: 対戦カード(例: 🇯🇵 JPN ●–● FRA 🇫🇷)のみ。大会名・放送情報などは含めない。スコア表示は`ScoreText.tsx`の`getScoreLabel`関数を再利用し、ネタバレガード中は常に`●–●`
3. タップで記事先頭(マストヘッド位置)へスクロールして戻る
4. 表示/非表示の切り替えは`opacity`と縦方向`transform`のみで行う。ブラー・影・ガラス表現・角丸カードは使わない。背景`colors.paper`+`colors.line`のhairline下罫+`colors.ink`文字、数字は`tabular-nums`。reduce motion時はcross-fadeのみ(`docs/motion-design-principles.md`のガイドラインに従う)

対象外:
- 大会名・放送情報・視聴方法のコンパクトヘッダーへの追加
- 他画面(ホーム・大会一覧等)への同種ヘッダーの追加
- スクロール連動アニメーションの高度な演出(バウンス等)

## アーキテクチャ上の注意

現在 `Screen`(`src/components/Screen.tsx`)が`ScrollView`を所有しており、`MatchDetailScreen`はその`children`として描画される(`app/matches/[id].tsx`が`<Screen showHeader={false} title="試合詳細"><MatchDetailScreen id={id} /></Screen>`という構成)。スクロール位置の追従にはこの構造を踏まえた設計が必要になる。例: `Screen`に任意の`onScroll`propを追加して内部`ScrollView`へ転送し、呼び出し元(`app/matches/[id].tsx`)でスクロール位置を管理してコンパクトヘッダーの表示状態を`MatchDetailScreen`へpropとして渡す、等。実装方法はCodexの裁量とするが、**`Screen`の汎用性(他画面での再利用)を壊さないこと**。`onScroll`はオプショナルにし、指定しない画面には影響がないようにする。

## データモデル変更 / API サーフェス

なし。

## UI サーフェス

- 新規コンポーネント`src/matches/CompactScoreHeader.tsx`(仮)
- マストヘッド(`match-masthead-card`)の実際の高さを`onLayout`等で実測し、それを基準にスクロール位置と比較して表示/非表示を切り替える(固定px値の決め打ちにしない)
- チーム表示は`flag_code`+`short_code`程度の最小構成
- 高さは48pt前後を目安とする

## 受け入れ条件

1. マストヘッドが画面上端より上にスクロールされるとコンパクトヘッダーが表示され、マストヘッドが再び画面内に入ると非表示になることを確認するテスト
2. コンパクトヘッダーのスコア表示が、ネタバレガード有効・未開示の間は常に`●–●`になることを確認するテスト(`getScoreLabel`ロジックとの整合)
3. コンパクトヘッダーをタップすると記事先頭へスクロールすることを確認するテスト
4. `Screen`コンポーネントが他の画面(ホーム・大会一覧・設定等)で従来通り動作すること(既存テストの回帰なし)を確認する
5. reduce motion有効時はcross-fade以外のアニメーションが行われないことを確認するテスト
6. TypeScript strict・lint・test green
7. **Owner 目視**: 実機または iOS Simulator で試合詳細をスクロールし、コンパクトヘッダーの出現・消失・タップ復帰を確認する

## 未解決の質問

- `Screen`へのスクロール連携方法(`onScroll` prop追加、または他の設計)はCodexの実装を見てOwnerが妥当性を確認する
- コンパクトヘッダーの正確な出現しきい値・アニメーション時間はCodexの裁量、既存レイアウトとの馴染みを見て判断する
