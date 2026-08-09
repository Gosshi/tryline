# fix-mobile-ios-audit-findings-batch3: iOS自律監査で確認したUI不具合(束3)

対象リポジトリ: **tryline-mobile**。`fix-mobile-ios-audit-findings-batch1`/`batch2` の後続。API・データモデル変更は不要(すべてクライアント側で閉じる)。

## 背景

2026-07-23、Fableによるデザイン監査(既存の①②報告)で挙がった中/低優先度の指摘のうち、ソースコードで裏取りが取れたものと、Owner自身が実機操作で発見した新規バグ1件をまとめて修正する。

## スコープ

対象:

1. **週見出しが±1週分しか対応していない**: `app/(tabs)/index.tsx`・`src/stories/MatchStoriesSection.tsx`の週ラベルは`weekOffset < 0 / > 0 / === 0`の3値判定のため、「前週」ボタンを2回押した`weekOffset = -2`(先々週)でも「先週のラグビー」と誤表示される。`weekOffset = 2`(再来週)でも同様に「来週のラグビー」のまま
2. **`ContentSection.tsx`が`###`(見出し3)・`>`(引用)のスタイル未定義**: `markdownStyles`/`leadMarkdownStyles`は`body`/`paragraph`/`heading1`/`heading2`のみ定義。記事本文に`###`や`>`が使われると`react-native-markdown-display`のデフォルトスタイルで描画され、紙・インクのエディトリアル路線から浮く
3. **ペイウォールがスコア開示前に見えてしまう**: `ContentSection.tsx`は`content.locked`のペイウォールブロックを`isRevealed`と無関係に常時描画している。ネタバレガードでスコア未開示のユーザーにも「Premiumでお読みいただけます」が先に見える
4. **マッチストーリーの自動送りが出典リンク操作中も止まらない**: `MatchStoriesSection.tsx`427-434行目の自動送り`useEffect`は`paused`状態を見るが、出典リンク(`Linking.openURL`)を押した際に`paused`をtrueにしていない。Safari遷移中にバックグラウンドでストーリーが進み、復帰時に「別のニュースが開いた」ように見える
5. **画像読み込み中に白フレームが一瞬見える**: `MatchStoriesSection.tsx`535行目付近、`{!imageFailed ? <Image .../> : <View style={viewerFallback}>...}`という排他条件のため、画像読み込み完了前(エラーではなくロード中)はダーク背景の`viewerFallback`が敷かれない。ストーリー間の遷移時に一瞬白/透明のフレームが見える
6. **大会一覧のシーズンチップの並び順が大会ごとにバラバラ**: `app/(tabs)/competitions/index.tsx`のシーズンチップは`groupCompetitionsForDisplay`が返す`group.seasons`(=`sortCompetitionSeasons`の結果)の順序をそのまま使っている。この関数は試合数(`match_count`)を第一キーにソートするため、大会によってはシーズンの新旧が入り乱れて見える
7. **設定画面のdev用警告文言に`__DEV__`ガードがない**: `app/(tabs)/settings.tsx`の「開発環境ではSupabase設定を...」の警告は`!isConfigured`条件のみで表示されており、`__DEV__`との併用ガードがない。ビルド設定のミスで本番でも`isConfigured`がfalseになった場合、この開発者向け文言がユーザーに見えてしまうリスクがある
8. **サインイン画面にマストヘッドがない**: `app/auth/sign-in.tsx`は`<Screen showHeader={false} title="ログイン">`のため、他画面にある赤eyebrowが一切表示されない。Premium誘導の重要な着地点なので、最小限の装飾が望ましい
9. **記事の出典・構成方針が読者に一切示されていない**: `ContentSection.tsx`の`preview`/`recap`本文には、内容がどう構成されているかの説明が一切ない。著作権対応の一環(案A、Owner確定済み)として、最小限の免責フッターを追加する

対象外:
- 大会名タイトルの折返し(`Screen`は既に`adjustsFontSizeToFit`+`numberOfLines={2}`を持っており、実害の確証が薄いため見送り)
- 「ラインナップ情報はまだありません」の文言修正(具体的な代替文言が未確定のため見送り)
- マッチストーリーのプレビュー本文が断ち切られる件(監査自体が「要調査」としており未検証)
- 順位表のチーム行タップ(既存specで対象外として記録済み。将来のグロース施策として別途検討)

## UI サーフェス(修正内容)

1. **週見出しの一般化**: `weekOffset`の絶対値に応じてラベルを拡張する。`|weekOffset| <= 1`は「先週/今週/来週」、`|weekOffset| === 2`は「先々週/再来週」、`|weekOffset| >= 3`は「{n}週間前」「{n}週間後」の汎用形式にフォールバックする。`app/(tabs)/index.tsx`のeyebrow・title、`MatchStoriesSection`のセクション見出し両方に同じロジックを適用する(重複しないよう共通関数化してよい)
2. **markdownスタイル追加**: `ContentSection.tsx`の`baseMarkdownStyle`に`heading3`(`typography.body`程度、太字)と`blockquote`(左に`colors.accent`のborder、`colors.muted`文字)を追加する。紙・インクのトーンを踏襲する
3. **ペイウォール表示条件**: `content.locked`のペイウォールブロックは、`hasRecap`が false、またはレビューが`isRevealed`のときのみ描画する。未開示時はペイウォールを表示しない
4. **自動送りの一時停止**: 出典リンクの`onPress`で`setPaused(true)`を呼ぶ。加えて`AppState`の変化(`background`→`active`)を監視し、バックグラウンドから復帰した際に自動送りタイマーを再開・リセットする
5. **画像読み込み時の背景**: `Image`と`viewerFallback`を同じ`View`(背景`colors.ink`固定)でラップし、画像読み込みの成功/失敗に関わらず常にダーク背景が下敷きになるようにする
6. **シーズンチップの並び順**: `competitions/index.tsx`でチップ描画直前に`group.seasons`を`season`(またはstart_date)降順で並べ替えた配列を使う。**`sortCompetitionSeasons`自体は変更しない**(他の用途に影響するため)。表示専用のソートをレンダー側に閉じ込める
7. **dev警告の`__DEV__`ガード**: `!isConfigured`の条件に`&& __DEV__`を追加する
8. **サインイン画面の装飾**: `showHeader={true}`に変更し`eyebrow="Account"`を追加する。titleは「ログイン」のまま。既存の`Card`レイアウトは変更しない
9. **出典・構成の免責フッター**: `ContentSection.tsx`で`hasRecap`または`hasPreview`のいずれかがtrueのとき、記事本文の末尾に定型文「この記事は複数の公開報道・公式記録をもとにTrylineが独自に構成しています。」を1回だけ表示する(preview/recap両方ある場合も1回)。リンクは不要。既存の`typography.small`/`colors.muted`程度の控えめなスタイルにする

## データモデル変更 / API サーフェス / LLM 連携

なし。

## 受け入れ条件

1. `weekOffset`が-3〜3の範囲で、eyebrow・title・ストーリー見出しがそれぞれ正しい文言(先々週/先週/今週/来週/再来週、範囲外は「N週間前」「N週間後」)になることを確認するテスト
2. `###`・`>`を含むmarkdown本文が、デフォルトスタイルでなく`heading3`/`blockquote`用に定義したスタイルで描画されることを確認するテスト
3. `isRevealed`がfalseのときペイウォールブロックが描画されず、trueになった後にのみ描画されることを確認するテスト(ロック対象のレビューがある場合)
4. 出典リンクを押すと`paused`相当の状態がtrueになり自動送りが止まることを確認するテスト
5. 画像読み込み中(ロード完了前)もダーク背景が表示されていることを確認するテスト(スナップショットではなく、背景Viewの存在と画像コンポーネントの重なりを明示的にアサーションする)
6. シーズンチップが日付降順で表示されることを確認するテスト。`sortCompetitionSeasons`のユニットテスト(既存)の期待値が変わらないことも確認する回帰テスト
7. `__DEV__`がfalseの場合、`isConfigured`がfalseでも警告文言が表示されないことを確認するテスト
8. サインイン画面に「Account」eyebrowが表示されることを確認するテスト
9. `hasPreview`または`hasRecap`がtrueのとき免責フッターが1回だけ表示されることを確認するテスト
10. TypeScript strict・lint・test green
11. **Owner 目視**: 実機または iOS Simulator で週送り・記事本文の見出し/引用・ペイウォール順序・ストーリー自動送り・画像遷移・シーズンチップ・サインイン画面を確認する

## 未解決の質問

なし。
