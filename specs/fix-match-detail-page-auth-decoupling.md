# fix-match-detail-page-auth-decoupling

## 背景

サイト全体の性能調査（2026-07-21、`curl -D -`で本番ヘッダー実測）で判明: `fix-public-page-auth-decoupling.md`（PR #606、マージ済み）でホームページと大会ハブページは`cache-control: public, max-age=0, must-revalidate`（ISR/キャッシュ可能）になっているのに対し、試合詳細ページ（`/matches/[id]`）だけ今も`cache-control: private, no-cache, no-store, max-age=0, must-revalidate`・`x-vercel-cache: MISS`のままだった。

原因を特定済み: `app/matches/[id]/page.tsx:310`の`const user = await getUser();`が、Next.jsのDynamic API（`cookies()`）を無条件に呼び出しており、これがページ全体を強制的に動的レンダリングにしている。ページ自体は`export const revalidate = 3600`（59行目）を宣言しているが、`getUser()`の存在によりISRが機能していない。

`user`の下流の用途を全て確認したところ、以下の**個人化表示のみ**で、コンテンツの実際のゲーティング（`splitRecapForPaywall`、`lib/match-content/markdown.ts:123`）は`user`に依存しない決定的なmarkdown分割処理であることを確認済み:
- `spoilerGuardEnabled`（`getSpoilerGuardEnabledForUser(user?.id)`）→ `MatchHeader`のスコア表示に渡す
- `{user && <FavoriteTeamFollowButton .../>}`（ヘッダー直下、両チーム分）
- `profile?.favorite_team_slugs` → `NextWatchSection`の初期お気に入り状態
- `isSignedIn={Boolean(user)}` → `NextWatchSection`内で「フォローする」ボタンか「このチームを追う」リンクかの出し分け

`PremiumMatchChat`（`components/premium-match-chat.tsx`）は`matchId`のみを受け取り、`user`/premium状態をpropsで受け取っていない＝既に自前でクライアント側の認証状態を扱っている。

ホームページの解決パターン（`components/home-user-state.tsx`の`HomepageUserStateProvider`、`getClientUserState()`をuseEffectで呼び`ClientUserState | null`をcontextで配る、`active`フラグでクリーンアップ）がそのまま転用できる。`lib/auth/client.ts`の`getClientUserState()`は変更不要（`favoriteTeamSlugs`・`isPremium`・`spoilerGuardEnabled`・`user`を既に返す）。

## スコープ

対象:
- `app/matches/[id]/page.tsx`から`const user = await getUser();`と、それに依存する`getSpoilerGuardEnabledForUser(user?.id)`・`user ? getUserProfile(user.id) : null`の呼び出しを削除する
- `components/home-user-state.tsx`の`HomepageUserStateProvider`のロジック（`getClientUserState()`のuseEffect呼び出し・contextプロバイダー・`active`フラグクリーンアップ）を、ホームページ専用の実装から**汎用の共有プロバイダー**に切り出す（例: `components/user-state-provider.tsx`に`UserStateProvider`・`useUserState()`フックとして移動し、`components/home-user-state.tsx`側はこれを使う形にリファクタリングする。DRY: 2つ目の実使用箇所ができたタイミングでの一般化のため、投機的な抽象化ではない）
- `app/matches/[id]/page.tsx`を新しい`UserStateProvider`でラップし、以下をサーバー側props経由でなくクライアント側contextから取得するように変更する:
  - `MatchHeader`への`spoilerGuardEnabled`
  - ヘッダー直下の`FavoriteTeamFollowButton`ブロックの表示条件（`user &&`）と`favoriteTeamSlugs`
  - `NextWatchSection`の`isSignedIn`・`favoriteTeamSlugs`
- 上記の変更により、ページが`cache-control: public`でキャッシュされる（本番デプロイ後に`curl -D -`で確認）

対象外:
- `PremiumMatchChat`の内部実装変更（既にクライアント側で完結している）
- コンテンツのゲーティングロジック（`splitRecapForPaywall`、`isPremium={true}`の各種セクション）の変更。これらは`user`に依存しておらず、本specの対象外
- 選手ページ・チームページ等、他ページの認可デカップリング（別途必要なら個別specとする）
- Premium状態（`isPremium`）自体の表示ロジック追加。本specは`spoilerGuardEnabled`・お気に入りチーム・サインイン有無の3点のみを扱う

## UI サーフェス

- 参照: `components/home-user-state.tsx`の`HomepageUserStateProvider`実装パターン（`useEffect`＋`active`フラグクリーンアップ。PR #606のCI失敗（`window is not defined`、テスト環境破棄後のReact Scheduler残留）を教訓に、新しい子コンポーネント（`FavoriteTeamFollowButton`ブロック・`NextWatchSection`）についても同様のクリーンアップが必要な非同期処理がないか確認すること
- サーバー側の初期表示（JS読み込み前・クローラー向け）は、個人化情報なしの状態（未サインイン相当の表示）でよい。ちらつき（サインイン済みユーザーに一瞬「このチームを追う」リンクが見えてから切り替わる等）が許容範囲かはOwnerが実装後に確認する
- **完了の定義にビジュアル確認を含める**: 実装後、Owner が試合詳細ページで（a）未サインイン時の表示、（b）サインイン済み・お気に入りチーム登録済み時の表示、の両方を確認し、個人化表示が壊れていないことを承認する

## 受け入れ条件

1. `app/matches/[id]/page.tsx`から`getUser`・`getUserProfile`・`getSpoilerGuardEnabledForUser`の直接呼び出しが削除されていることを確認する
2. `components/home-user-state.tsx`の`HomepageUserStateProvider`のcontext/フェッチロジックが共有プロバイダーに切り出され、ホームページ側の既存テストが壊れていないことを確認する回帰テストがある
3. 試合詳細ページで、サインイン時に`MatchHeader`のスコアがネタバレガード設定に従って表示されることを確認するテストがある
4. 試合詳細ページで、サインイン時にお気に入りチームボタンが表示され、未サインイン時は「このチームを追う」リンクが表示されることを確認するテストがある
5. 本番デプロイ後、`curl -D -`で試合詳細ページのレスポンスヘッダーを確認し、`cache-control`が`no-store`から`public, max-age=0, must-revalidate`相当に変わっていることをOwnerに報告する
6. `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` が通る
7. Owner による実機確認（未サインイン・サインイン済みの両方）で個人化表示に問題がないことの承認を得ること

## 未解決の質問

- サインイン済みユーザーがページを開いた際、個人化情報が届くまでの一瞬（クライアント側`getClientUserState()`のfetch完了まで）に未サインイン相当の表示が見える「ちらつき」が発生する。ホームページでは許容されている前提だが、試合詳細ページでも同様の許容で問題ないかはOwnerが実装後の見た目で判断する
