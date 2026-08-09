# feat-mobile-ios26-translucency: タブバー・ヘッダー・戻る導線をiOS標準の語彙に寄せる

対象リポジトリ: **tryline-mobile**のみ。新規依存パッケージ`expo-blur`を追加する(Expo SDK 57対応の標準パッケージ、追加のネイティブ設定は不要)。API・データモデル変更は不要。

## 背景

2026-07-25の外部GPTによるiOS総合監査(iOSアプリらしさ区分)で、以下3件が指摘された。TrylineはExpo/React Native製でSwiftUIのLiquid Glass APIを直接使えないが、既存のExpo標準機能(`expo-blur`)・標準アイコン(`Ionicons`)・標準ジェスチャーで同等の体感に近づけられる範囲を対象にする。

- **タブバーが不透明で奥行きがない**: `app/(tabs)/_layout.tsx`の`tabBarStyle`は`backgroundColor: colors.card`(白)の完全不透明。スクロール時にコンテンツがバーの下に潜り込む表現がなく、硬い境界線(`borderTopColor: colors.line`)で区切られている
- **試合詳細のmastheadが常に不透明**: `src/matches/MatchDetailScreen.tsx`の試合結果表示部分(`match-masthead-card`)は白背景・実線ボーダーの`Card`(`src/components/Card.tsx`)にそのまま入っており、新聞の題字というより固定Webヘッダーのように見える
- **オンボーディングの戻る操作が標準語彙と異なる**: `app/onboarding.tsx`の「戻る」ボタンは画面上部中央付近にテキストのみで配置されており、他のiOS標準画面にある左上のchevron付き戻るボタンと視覚的に一貫しない

## スコープ

対象:
1. タブバーを`expo-blur`の`BlurView`を使った半透明背景にする(iOS標準のタブバーの奥行き表現に近づける)
2. 試合詳細mastheadの白いCard包囲・実線ボーダーをやめ、暗色バンドが画面幅いっぱいに広がる「題字」らしい表現にする
3. オンボーディング初期画面の「戻る」ボタンを、左上・chevronアイコン付きの標準的な戻る導線にする

対象外:
- ダークモード対応(v1はライトモードのみ、既存方針を維持)
- タブバー以外のナビゲーション構造変更
- Androidでの見た目調整(iOS優先、Androidは既存の不透明表示のままでよい)

## UI サーフェス

### タブバーの半透明化(`app/(tabs)/_layout.tsx`)

- `expo-blur`を依存に追加する(`npx expo install expo-blur`相当)
- `screenOptions`に`tabBarBackground: () => <BlurView intensity={..} tint="light" style={StyleSheet.absoluteFill} />`を追加する(intensity値はCodexの裁量、他アプリの標準的な範囲でよい)
- `tabBarStyle`の`backgroundColor`を透明にし、`position: "absolute"`にする(コンテンツがタブバーの下に潜り込むようにするため)
- `tabBarStyle`が`position: "absolute"`になることでコンテンツ末尾がタブバーに隠れる可能性があるため、各タブ画面(`Screen`コンポーネント経由、`src/components/Screen.tsx`の`content.paddingBottom`)が十分な余白を持っているか確認し、不足していれば調整する
- `borderTopColor`の実線は、半透明化後に不要であれば削除・調整してよい(視覚的に破綻しないことを優先する)

### 試合詳細mastheadの題字化(`src/matches/MatchDetailScreen.tsx`)

- `match-masthead-card`を囲む`Card`コンポーネントの使用をやめ、専用のスタイル(暗色背景、実線ボーダーなし、画面幅いっぱいに広がる)に置き換える。角丸をなくす、または画面端まで到達する形にしてよい
- 内部の`TeamIdentity`・`ScoreText`(既存の`inverse`/`tone="inverse"`表現)の見た目・ロジックは変更しない
- `BroadcastLinks`等、masthead内の他要素の配置は維持する

### オンボーディング戻るボタンの標準化(`app/onboarding.tsx`)

- 「戻る」ボタン(`router.canGoBack()`がtrueのときのみ表示、既存ロジック維持)を、画面左上に配置する
- `@expo/vector-icons`の`Ionicons`(`chevron-back`、他画面のタブアイコンと同じライブラリ)を使い、アイコン+「戻る」または矢印のみのシンプルな表現にする
- エッジスワイプでの戻り操作がすでに機能していること(native stackのデフォルト挙動)を確認し、`gestureEnabled: false`等で無効化されていないことを確認する

## データモデル変更 / API サーフェス / LLM 連携

なし。

## 受け入れ条件

1. `app/(tabs)/_layout.tsx`が`expo-blur`の`BlurView`を`tabBarBackground`として使っていることを確認する(スナップショット的なテストではなく、コンポーネント構成のテストでよい)
2. タブ画面のコンテンツ末尾がタブバーの半透明背景に隠れて読めなくならないこと(paddingBottom調整の確認)
3. `MatchDetailScreen`のmastheadが`Card`コンポーネントを使わなくなっていることを確認するテスト
4. `app/onboarding.tsx`の「戻る」ボタンが左上に配置され、chevronアイコンを含むことを確認するテスト
5. TypeScript strict・lint・test green
6. **Owner目視**: TestFlightビルドでタブ切り替え時のスクロール潜り込み表現、試合詳細mastheadの見た目、オンボーディングの戻るボタンとエッジスワイプを確認する

## 未解決の質問

なし。
