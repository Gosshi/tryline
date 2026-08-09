# feat-mobile-onboarding-favorites-sync: オンボーディング選択のホーム反映とログイン同期

対象リポジトリ: **tryline-mobile** のみ。**`feat-mobile-onboarding-team-picker`(Stage A)のマージ後に着手する後続spec**。`pendingFavoritesStore`(Stage Aで実装済み)を前提とする。

## 背景

`feat-mobile-onboarding-team-picker`(Stage A)で、初回起動時にチームを選び`expo-secure-store`へローカル保存するところまでは実装済みになる。本specはその続き: 選択が実際にホーム画面へ反映され、ログイン時にサーバー側のお気に入りへ同期される部分を実装する。GPT提案(2026-07-23)の「選んだ直後にホームの並びが変わるところまでをオンボーディング体験に含めるべき」を完結させる。

## スコープ

対象:
1. **ホーム画面のログイン前パーソナライズ**: `app/(tabs)/index.tsx` の `splitFavoriteMatches(matches, me?.favorite_team_slugs ?? [])` 呼び出しを、未ログイン時は `pendingFavoritesStore` のローカル保留分のチームslugを使うように拡張する。ログイン時は従来通り `me.favorite_team_slugs` を優先する
2. **ログイン成立時の同期**: `AuthProvider.tsx` の `verifyOtp` 成功後、`pendingFavoritesStore` にローカル保留分があれば既存の `trylineApi.updateFavorites` へ1回だけ反映し、成功後にローカル保留分を消す。同期失敗時は保留分を保持し次回サインイン成立時に再同期を試みる

対象外:
- オンボーディングのUI・チーム選択画面自体(Stage Aで実装済み)
- `pendingFavoritesStore` の実装自体(Stage Aで実装済み。本specはそれを呼び出す側)
- お気に入り上限・BFF・データモデルの変更

## データモデル変更 / API サーフェス

なし(既存の`trylineApi.updateFavorites`をそのまま使う)。

## UI サーフェス

- ホーム画面の見た目自体は変更しない。渡す`favoriteTeamSlugs`の出所が未ログイン時に切り替わるだけ

## 受け入れ条件

1. 未ログイン状態でホーム画面を開くと、`pendingFavoritesStore`のローカル保留分のチームがお気に入り区画に反映されることを確認するテスト
2. ログイン済みの場合は従来通り`me.favorite_team_slugs`が優先されることを確認する回帰テスト(未ログイン時のローカル保留分と混同しないこと)
3. サインイン完了時にローカル保留分があれば`updateFavorites`へ同期され、成功後にローカル保留分は消えることを確認するテスト
4. 同期失敗時はローカル保留分を保持し、次回サインイン成立時に再同期を試みることを確認するテスト
5. ローカル保留分が空の場合、サインイン時に不要な`updateFavorites`呼び出しが発生しないことを確認するテスト
6. TypeScript strict・lint・test green
7. **Owner 目視**: 実機または iOS Simulator でオンボーディング完了→ホーム反映→サインイン→サーバー同期までの一連の流れを確認する

## 未解決の質問

なし。
