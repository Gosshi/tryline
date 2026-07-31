# fix-mobile-ios-audit-findings-batch5: iOS総合監査(デザイン/グロース/iOSらしさ)の軽微な不具合(束5)

対象リポジトリ: **tryline-mobile**のみ。`fix-mobile-ios-audit-findings-batch1`〜`batch4`の後続。API・データモデル変更は不要。

## 背景

2026-07-25、外部GPTによるiOS総合監査(デザイン・グロース機能・iOSアプリらしさ・機能改善案)で見つかった指摘のうち、独立して直せる軽微なもの3件をまとめて修正する。大会一覧・大会詳細の再設計([[feat-mobile-competition-listing-editorial-redesign]])、共有導線([[feat-mobile-growth-sharing]])、iOSらしさの半透明化([[feat-mobile-ios26-translucency]])は規模が大きいため別specとする。

以下は監査で指摘されたが、コード確認の結果**対応不要と判断した**:
- **週送りボタン(前週/今週/翌週)のタップ領域が44pt未満に見える**: `src/components/Button.tsx`の`styles.base`は`minHeight: 44`を既に持っている。全ボタン共通のスタイルなので、週送りボタンだけ44pt未満になることはない。GPTのスクリーンショット上の目視推定による誤検出と判断する

## スコープ

対象:
1. **設定→お気に入りの文言矛盾**: `src/settings/FavoritesEditor.tsx`の未ログイン時表示(`!me`分岐)は「お気に入りチームの編集にはログインが必要です」と表示するが、実際は直後の「チームを選ぶ」ボタンから`/onboarding`へ遷移でき、未ログインのままローカルに保存できる([[project_mobile_team_candidate_bug]]の候補ロジック問題とは別)。制限が実際より強く見え、利用者が離脱する
2. **ストーリーズの画像読み込み失敗時のフォールバックが弱い**: `src/stories/MatchStoriesSection.tsx`は画像読み込み中、5秒以上待っても背景が無地の濃紺のままになるケースがある(読み込み失敗のフォールバック`viewerFallback`は`imageFailed`がtrueになったときだけ表示され、読み込み中・タイムアウトのケースをカバーしていない)
3. **一部画面のタップに視覚フィードバックがない**: `src/home/Rwc2027Banner.tsx`・`src/matches/BroadcastLinks.tsx`は素の`Pressable`を使っており、`src/components/SpringPressable.tsx`(押下時にscale 0.97+opacity 0.7で反応する既存の共通コンポーネント)を経由していない。他画面(`Button`経由)と比べて押下感が一貫しない

対象外:
- `app/(tabs)/competitions/index.tsx`・`[slug].tsx`の`Pressable`([[feat-mobile-competition-listing-editorial-redesign]]で画面ごと再設計するため、そちらで対応)
- `src/matches/MatchDetailScreen.tsx`・`src/matches/ContentSection.tsx`・`src/stories/MatchStoriesSection.tsx`内の`Pressable`(共有導線・iOSらしさ関連specで同じファイルを触るため、そちらで対応)
- 週送りボタンのタップ領域(前述、対応不要と判断)

## UI サーフェス

1. **お気に入り文言修正**: `FavoritesEditor.tsx`の`!me`分岐の本文を「お気に入りチームの編集にはログインが必要です」→「未ログイン中はこの端末に保存され、ログイン時に同期されます」に変更する。ボタン「チームを選ぶ」の挙動は変更しない
2. **画像フォールバック強化**: `MatchStoriesSection.tsx`で、画像コンポーネントの`onLoadStart`/`onLoad`を使い、読み込み中も`imageFailed`と同じダーク背景フォールバック面(国旗・対戦略称・細い罫線等、既存の`viewerFallback`のスタイル)を下敷きにする。画像読み込み完了後にフォールバックの上に画像を重ねる構成にし、白/無地の空白フレームが出ないようにする
3. **タップフィードバック統一**: `Rwc2027Banner.tsx`・`BroadcastLinks.tsx`内の素の`Pressable`を`SpringPressable`に置き換える。既存のonPress・アクセシビリティ属性は維持する

## データモデル変更 / API サーフェス / LLM 連携

なし。

## 受け入れ条件

1. `FavoritesEditor.tsx`の未ログイン時表示に「ログインが必要」という文言が残っていないことを確認するテスト
2. `MatchStoriesSection.tsx`で画像読み込み中(ロード完了前)もダーク背景フォールバックが表示されていることを確認するテスト(背景Viewと画像コンポーネントの重なりを明示的にアサーションする)
3. `Rwc2027Banner.tsx`・`BroadcastLinks.tsx`が`SpringPressable`を使っていることを確認するテスト(押下時にスタイルが変化する、または`SpringPressable`がレンダーされていることを確認)
4. TypeScript strict・lint・test green

## 未解決の質問

なし。
