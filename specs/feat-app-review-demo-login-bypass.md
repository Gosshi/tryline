# App Review用デモアカウントの固定コードログインバイパス

## 背景

iOSアプリ（tryline-mobile）はメールOTP（Supabase `signInWithOtp`/`verifyOtp`）のみでログインする。App Store審査担当者はPremiumコンテンツまで到達する必要があるが（[[project_ios_release_readiness_gaps]]項目2）、OTPは審査担当者がアクセスできないOwner管理のメール受信箱に届くため、実際のOTPフローでは審査担当者はログインできない。

Review Notesに「デモアカウントのメールとOTP受信方法」を書くだけでは解決しない（審査担当者はOwnerの受信箱を見られない）。恒久的な解決として、**特定の1メールアドレス宛に限り、固定の秘密コードでログインできるバイパス経路**をサーバー側に追加する。

## スコープ

対象（tryline / web）:
- 新規APIルート `POST /api/v1/auth/demo-review-session` を追加
  - リクエストボディ: `{ email: string, code: string }`
  - 環境変数 `APP_REVIEW_DEMO_EMAIL` と `APP_REVIEW_DEMO_OTP` を新規追加（Vercel側にOwnerが設定、リポジトリにコミットしない）
  - **両方の環境変数が未設定の場合、このルートは常に404を返す**（デフォルトで無効＝kill switch）
  - `email`（大文字小文字を無視して比較）と `code` が両方とも環境変数の値と完全一致した場合のみ、Supabase Admin API（`getSupabaseServerClient`のservice role権限）で対象ユーザーのセッションを発行して返す。実装方法の一例: `supabase.auth.admin.generateLink({ type: "magiclink", email })` でトークンを発行し、匿名クライアントの `supabase.auth.verifyOtp({ token_hash, type: "magiclink" })` で実セッション（`access_token`/`refresh_token`）に交換する。**Supabase JS SDKの現行APIサーフェスと差異がないか実装前に確認し、差異があれば実装を停止してOwnerに報告すること**
  - 一致しない場合は401を返す（存在確認につながる情報は返さない。「emailが違う」「codeが違う」を区別するメッセージを出さない）
  - 対象ユーザー（`APP_REVIEW_DEMO_EMAIL`のアカウント）が存在しない場合は500ではなく401を返す（存在有無を漏らさない）

対象（tryline-mobile）:
- `src/auth/AuthProvider.tsx` の `verifyOtp` を変更する: Supabaseの実OTP検証(`supabase.auth.verifyOtp`)が失敗した場合のみ、フォールバックとして `POST /api/v1/auth/demo-review-session` に同じ `email`/`token` を送る。成功した場合はレスポンスの `access_token`/`refresh_token` で `supabase.auth.setSession(...)` を呼び、以降の処理（`syncPendingFavorites`・`setSession`）は既存の成功パスと同じにする
- 通常ユーザー（`APP_REVIEW_DEMO_EMAIL`と一致しないメール）は、Supabaseの実OTP検証が失敗した場合にこのフォールバックも失敗するため、体感できる挙動の変化はない（エラーメッセージが1往復分遅くなる可能性はあるが許容する）
- UI（`app/auth/sign-in.tsx`）の変更は不要。既存の「メール＋6桁コード」入力フォームをそのまま使う

対象外:
- レート制限の実装（既存コードベースにユーザー向けAPIのレート制限基盤がないため、今回はkill switch（環境変数）＋長い（32文字以上を推奨）ランダムな秘密コードでの防御に留める。将来レート制限基盤ができたら追加を検討）
- 審査以外の一般ユーザー向け機能としてのバイパス経路の恒久化。**Ownerは審査期間中のみ環境変数を設定し、承認後は速やかに未設定に戻す（またはコードをローテーションする）運用とする**
- Web側の同機能（Web側は通常のStripe契約者ログインのみで審査対象外のため不要）

## データモデル変更

なし。

## API サーフェス

新規: `POST /api/v1/auth/demo-review-session`
- リクエスト: `{ email: string, code: string }`
- 成功時レスポンス: `{ success: true, data: { access_token: string, refresh_token: string }, error: null }`
- 失敗時: 401 `{ success: false, data: null, error: "invalid_credentials" }`。環境変数未設定時は404

## セキュリティ上の注意（実装前に必ず確認）

- `APP_REVIEW_DEMO_OTP` は6桁数字のような短いコードにしない。Owner側で32文字以上のランダム文字列を生成して環境変数に設定する前提で実装する（コード側で長さを強制するバリデーションは不要、運用ルールとしてdocs側に明記する）
- このエンドポイントは認証境界に関わる変更のため、実装後は通常のコードレビューに加えてsecurity-reviewer相当の観点（対象ユーザー以外への影響がないか、エラーメッセージからの情報漏洩がないか）を必ず確認する
- サービスロールキーを使う処理は`lib/db/server.ts`の既存パターンに従う。クライアント（anon key）側では絶対にこのロジックを実行しない

## 受け入れ条件

1. `APP_REVIEW_DEMO_EMAIL`/`APP_REVIEW_DEMO_OTP`が未設定の環境で`POST /api/v1/auth/demo-review-session`を呼ぶと404が返るテスト
2. 両環境変数が設定された環境で、正しい`email`+`code`を送ると有効なセッション（`access_token`/`refresh_token`）が返るテスト
3. `email`が一致し`code`が不一致、または`email`が不一致の場合はいずれも401で、レスポンス内容が同一（存在有無が漏れない）ことを確認するテスト
4. mobile: Supabaseの実OTP検証が成功する通常ユーザーのログインフローに変化がないことを確認する既存テストの回帰なし
5. mobile: Supabase実OTP検証が失敗した場合にフォールバックAPIを呼ぶこと、フォールバックが成功した場合に`setSession`が呼ばれることを確認するテスト
6. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build`（web/mobile とも）が通る

## 未解決の質問

- `supabase.auth.admin.generateLink` → `verifyOtp(token_hash, type: "magiclink")` の組み合わせが現行のSupabase JS SDKバージョンで実際に動作するか、Codexが実装時に検証すること。動作しない場合は代替手段（Supabase側のドキュメント再確認）を提案して一旦停止する
- `APP_REVIEW_DEMO_EMAIL`に対応するSupabaseユーザーは`docs/ios-app-store-submission.md`の手順3でOwnerが事前に作成する前提。このユーザーが存在しない状態でのエラーハンドリングは受け入れ条件の「401（存在有無を漏らさない）」に従う
