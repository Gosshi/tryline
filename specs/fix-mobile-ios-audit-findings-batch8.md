# fix-mobile-ios-audit-findings-batch8: リリース可否監査の公開ブロッカー級不具合5件

対象リポジトリ: **tryline-mobile**のみ。`fix-mobile-ios-audit-findings-batch1`〜`batch7`の後続。API・データモデル変更は不要。

## 背景

2026-07-25、外部GPTによるiOSリリース可否監査(App Store審査要件・機能充足性・運用信頼性)で見つかった指摘のうち、コードで直接修正できる5件をまとめる。いずれもソースコードで裏取り済み。

- **ゲストのお気に入りがプッシュ登録に渡らない**: `src/settings/SettingsProvider.tsx`の`favoriteTeamSlugs`は`me?.favorite_team_slugs ?? []`のみを参照しており、未ログイン時は常に空配列。オンボーディングでローカル保存された`pendingFavoritesStore`の内容が反映されない。今日追加した「お気に入りチームの試合が近づいたら通知でお知らせします」という空状態の文言([[feat-mobile-match-list-typography-refresh]])が、実際にはゲストには機能しない状態になっている
- **試合詳細のmasthead上部の空白(4回目)**: `src/components/Screen.tsx`の`disableTopInset`propは`ScrollView`の`contentContainerStyle`のpaddingしか制御していない。外側の`<SafeAreaView edges={["top"]}>`は`disableTopInset`の値に関わらず常にDynamic Island分の余白を確保するため、対症療法を重ねても空白が消えなかった
- **`/me`取得失敗時にリトライなしでPremium扱いが無料に落ちる**: `src/auth/AuthProvider.tsx`は`/me`の取得に失敗すると`.catch(() => setMe(null))`で即座に`null`にする。一時的な通信エラーでもログイン済みPremiumユーザーが無料ユーザー扱いになり、再起動するまで回復しない
- **APIリクエストにタイムアウトがない**: `src/api/client.ts`の`request`関数は素の`fetch`を使っており、`AbortController`等によるタイムアウト設定がない。回線断・応答停止時にOS側タイムアウトまで読み込み中表示が続く
- **ログインモーダルに明示的な閉じるボタンがない**: `app/_layout.tsx`で`auth/sign-in`は`presentation: "modal"`で登録されているが、`headerLeft`に閉じるボタンがなく、下スワイプ以外の離脱手段がない

## スコープ

対象:
1. `src/settings/SettingsProvider.tsx`: 未ログイン時は`pendingFavoritesStore`(`src/onboarding/pendingFavoritesStore.ts`)のローカル保存分をプッシュ登録の`teamSlugs`に使う
2. `src/components/Screen.tsx`: `disableTopInset`が真のとき、外側の`SafeAreaView`の`edges`からも`"top"`を除外する。ただしテキストコンテンツがDynamic Island/ノッチと重ならないよう、`disableTopInset`を使う画面(試合詳細)側で`useSafeAreaInsets()`を使い、必要な要素(masthead内のテキスト等)に個別にinsetを適用する
3. `src/auth/AuthProvider.tsx`: `/me`取得失敗時に即`setMe(null)`せず、最後に成功した`me`の値を保持したまま、次回成功時に更新する。明確な認証エラー(401)の場合のみ`null`にする
4. `src/api/client.ts`: `request`関数に`AbortController`ベースのタイムアウト(目安10〜15秒)を追加し、タイムアウト時は既存の`TrylineApiError`として分かりやすいメッセージを返す
5. `app/_layout.tsx`・`app/auth/sign-in.tsx`: サインインモーダルに`headerLeft`等で明示的な「閉じる」ボタンを追加する

対象外:
- プライバシーポリシー・App Store Connectのメタデータ(Owner対応、コード外)
- プッシュ通知の実配送確認・アカウント削除の実データ確認(Owner対応、コード外)
- Pull to Refresh・試合中の自動更新等の新機能(別途検討、[[project_mobile_feature_proposals_pending]]参照)

## UI サーフェス

### ゲストお気に入りのプッシュ登録反映(`SettingsProvider.tsx`)

- `me`がnullのとき、`favoriteTeamSlugs`を`pendingFavoritesStore.getPendingFavoriteSlugs()`から取得する(既存のホーム画面での使用パターン、`app/(tabs)/index.tsx`と同様の非同期取得+state管理)
- ログイン済みのときは従来通り`me.favorite_team_slugs`を使う

### mastheadのSafe Area根本修正(`Screen.tsx`・`MatchDetailScreen.tsx`)

- `Screen`の`disableTopInset`が真のとき、`<SafeAreaView edges={disableTopInset ? [] : ["top"]}>`のように`edges`自体を切り替える
- `MatchDetailScreen.tsx`側で`useSafeAreaInsets()`(`react-native-safe-area-context`)を使い、masthead内の実際のテキスト(大会名・共有ボタン等)には`paddingTop: insets.top`相当を個別に適用し、暗色背景だけが画面最上部(Dynamic Islandの裏側)まで届くようにする

### `/me`の一時的失敗を許容(`AuthProvider.tsx`)

- `.catch()`ブロックで、エラーが401(未認証)の場合のみ`setMe(null)`、それ以外(ネットワークエラー等)は既存の`me`をそのまま維持する

### APIタイムアウト(`api/client.ts`)

- `fetch`呼び出しに`AbortController`を渡し、10〜15秒でタイムアウトさせる
- タイムアウト時は`TrylineApiError`(既存の日本語メッセージ・再試行UIパターン)としてスローする

### サインインモーダルの閉じるボタン(`app/_layout.tsx`・`app/auth/sign-in.tsx`)

- `Stack.Screen`の`options`に`headerShown: true`+`headerLeft`で「閉じる」ボタン(`router.back()`)を追加する。既存の`Screen`コンポーネント側の見出し(`eyebrow="Account"` `title="ログイン"`)と重複しないよう、ネイティブヘッダー側は最小限(閉じるボタンのみ)にする

## データモデル変更 / API サーフェス / LLM 連携

なし。

## 受け入れ条件

1. 未ログイン状態でお気に入りチームを選択している場合、プッシュ登録リクエストの`team_slugs`にそのチームが含まれることを確認するテスト
2. `disableTopInset`が真のとき`SafeAreaView`の`edges`が空配列になることを確認するテスト。`MatchDetailScreen`のmasthead内テキストに`insets.top`相当のpaddingが適用されることを確認するテスト
3. `/me`取得が401以外のエラーで失敗した場合、既存の`me`の値が保持されることを確認するテスト。401の場合は`null`になることも確認する
4. `request`関数がタイムアウト時に`TrylineApiError`をスローすることを確認するテスト
5. サインインモーダルに閉じるボタンが表示され、押下で`router.back()`が呼ばれることを確認するテスト
6. TypeScript strict・lint・test green
7. **Owner目視**: TestFlightビルドで、ゲスト状態でのお気に入り登録→通知設定、試合詳細のmasthead上部の空白解消、ログインモーダルの閉じるボタンを確認する

## 未解決の質問

なし。
