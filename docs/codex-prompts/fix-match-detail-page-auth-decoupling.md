`/specs/fix-match-detail-page-auth-decoupling.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 本番ヘッダー実測（2026-07-21）で判明: 試合詳細ページ（`/matches/[id]`）だけ`cache-control: no-store`のままで、ホームページ・大会ハブページ（PR #606で解決済み）と違いキャッシュされていない
- 原因は`app/matches/[id]/page.tsx:310`の`const user = await getUser();`（Dynamic API `cookies()`を呼ぶ）。下流の用途は全て個人化表示のみ（ネタバレガード・お気に入りチームボタン・次に見るのサインイン分岐）で、コンテンツのゲーティング自体は`user`に依存しない
- ホームページは既に`components/home-user-state.tsx`の`HomepageUserStateProvider`パターン（`getClientUserState()`をクライアント側useEffectで呼びcontext配布）で同じ問題を解決済み。`lib/auth/client.ts`の`getClientUserState()`は変更不要

やること:
- `app/matches/[id]/page.tsx`から`getUser`・`getUserProfile`・`getSpoilerGuardEnabledForUser`の呼び出しを削除する
- `components/home-user-state.tsx`の`HomepageUserStateProvider`のcontext/フェッチロジックを汎用の共有プロバイダー（例: `components/user-state-provider.tsx`の`UserStateProvider`・`useUserState()`）に切り出し、ホームページ側もこれを使うようリファクタリングする
- 試合詳細ページを新しい`UserStateProvider`でラップし、`MatchHeader`の`spoilerGuardEnabled`、ヘッダー直下の`FavoriteTeamFollowButton`ブロックの表示条件、`NextWatchSection`の`isSignedIn`・`favoriteTeamSlugs`をクライアント側contextから取得するように変更する

処理すべきエッジケース:
- サインイン状態が届くまでの一瞬、未サインイン相当の表示になる「ちらつき」が発生する。ホームページと同様の許容とする
- PR #606のCI失敗（テスト環境破棄後のReact Scheduler残留、`window is not defined`）と同型の非同期クリーンアップ漏れがないよう、新しいクライアントコンポーネントの`useEffect`には`active`フラグ等のクリーンアップを必ず入れる

完了の定義:
- specの受け入れ条件1〜7を満たす。5番目（本番`curl -D -`確認）と7番目（Owner実機確認）は、実装・デプロイ後にOwnerが確認する形でよい
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- `PremiumMatchChat`の内部実装は変更しない（既にクライアント側で完結）
- `splitRecapForPaywall`等のコンテンツゲーティングロジックは変更しない
- 選手ページ・チームページ等、他ページへの適用は対象外
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 未サインイン時・サインイン済み時（お気に入りチーム登録済み）両方のスクリーンショットを添付する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
