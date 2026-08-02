# Codex プロンプト: feat-app-review-demo-login-bypass

2部構成。**A(tryline/web) → B(tryline-mobile) の順序を厳守**。BはAのAPIエンドポイントの存在を前提にする。

**認証境界に関わる変更**です。通常の受け入れ条件チェックに加え、完了報告に「セキュリティ自己チェック」の結果を必ず含めてください（対象メール以外のユーザーに影響がないか / エラーレスポンスからemail・code どちらが不一致かの情報が漏れていないか / service role keyを使う処理がクライアントに露出していないか）。

---

## プロンプトA（trylineリポジトリで貼る）

`specs/feat-app-review-demo-login-bypass.md` の「対象（tryline / web）」セクションを実装してください。

コンテキスト:
- `AGENTS.md` を読む
- 既存の認証まわりAPIルートのパターンは `app/api/v1/me/route.ts`、`app/api/v1/push/register/route.ts` を参照（`getSupabaseServerClient`によるservice role client取得パターン）
- 環境変数の追加は `.env.example` にも `APP_REVIEW_DEMO_EMAIL=` / `APP_REVIEW_DEMO_OTP=`（値は空欄、コメントで「App Review用、通常は未設定」と明記）を追記する。実際の値はコミットしない
- `supabase.auth.admin.generateLink({ type: "magiclink", email })` → 匿名クライアントで `verifyOtp({ token_hash, type: "magiclink" })` によるセッション発行が、現在インストールされている `@supabase/supabase-js` のバージョンで型・挙動ともに成立するか、実装前に `node_modules/@supabase/supabase-js` の型定義または公式ドキュメントで確認すること。成立しない場合は実装を停止しOwnerに代替案を相談する

エッジケース:
- 環境変数が片方だけ設定されている場合も404扱いにする（両方揃って初めて有効）
- `email`の比較は大文字小文字を無視するが、`code`の比較は大文字小文字を区別する（秘密の強度を落とさない）
- 対象ユーザーが存在しない場合とcodeが不一致の場合で、レスポンスの文言・ステータスコードを完全に同一にする

やらないこと:
- レート制限の実装（spec「対象外」参照）
- 既存の`signInWithOtp`/`verifyOtp`のフロー・他のAPIルートへの変更

完了の定義:
- specの受け入れ条件1〜3, 6(web分)を満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧とセキュリティ自己チェック結果を報告する

完了時:
- 実装内容を要約する
- `supabase.auth.admin.generateLink`方式で実装したか、別方式にしたか（した場合は理由）を報告する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

---

## プロンプトB（tryline-mobileリポジトリで貼る、プロンプトA完了・マージ後に着手）

`specs/feat-app-review-demo-login-bypass.md`(tryline側specのミラーは`docs/specs/`に配置予定、無ければtryline側の同名ファイルを参照)の「対象（tryline-mobile）」セクションを実装してください。**プロンプトAがtryline側でマージ・本番デプロイ済みであることを前提とする**。

コンテキスト:
- `AGENTS.md` を読む
- 変更対象は `src/auth/AuthProvider.tsx` の `verifyOtp` のみ。`app/auth/sign-in.tsx`（UI）は変更不要
- フォールバックAPI呼び出しは既存の `src/api/client.ts` の `request` ヘルパーパターンに倣う

エッジケース:
- フォールバックAPIも失敗した場合、ユーザーに見えるエラーメッセージは既存の「認証コードが正しくありません。再送してもう一度お試しください。」のままにする（内部でフォールバックを試みたことをユーザーに悟らせる文言を追加しない）
- フォールバック成功時も、既存の成功パス（`syncPendingFavorites`呼び出し・`setSession`）を必ず通す

やらないこと:
- UIの変更
- 通常ユーザーのOTPフロー自体の変更（あくまで失敗時のフォールバック追加のみ）

完了の定義:
- specの受け入れ条件4, 5, 6(mobile分)を満たす
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
