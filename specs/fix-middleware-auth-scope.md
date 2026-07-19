# fix-middleware-auth-scope

## 背景

`middleware.ts` は `matcher` で `_next/static` ・ `_next/image` ・ `favicon.ico` ・ `api/stripe/webhook` ・ `api/og` ・画像拡張子を除く、ほぼ全てのリクエストにマッチする。マッチした全リクエストで `supabase.auth.getUser()` を無条件に実行し、Supabaseへのネットワーク往復が発生する（トークンリフレッシュ目的、`middleware.ts` 内コメント「トークンをリフレッシュし、期限切れの場合はCookieを更新する」）。

匿名ユーザー（Supabase認証Cookieを一切持たない訪問者）であっても、トップページ・試合ページ・カレンダー等の完全に公開されたページへのリクエストのたびにこの認証チェックが走っており、`[[project_site_performance]]` で報告されているTTFB悪化（トップ約3.0秒等）の一因と推測される。

`fix-public-page-auth-decoupling.md`（別spec、ヘッダー・ページ本体からの認証呼び出し分離）と合わせて対応することで、公開ページの認証呼び出しをゼロに近づける。

## スコープ

対象:
- `middleware.ts` を変更し、リクエストにSupabase認証関連のCookie（例: `sb-*-auth-token` 等、実際のCookie名はSupabase SSRクライアントの実装を確認して特定する）が**存在する場合のみ** `supabase.auth.getUser()` を実行する
- 認証Cookieが存在しない場合は、トークンリフレッシュ処理をスキップしてそのまま `NextResponse.next()` を返す
- **調査により判明（2026-07-20）: 本コードベースには現状「認証必須で未ログイン時にリダイレクトするページ」が存在しない**（`app/`配下の`redirect()`呼び出しは全て正規URL変換用で、認証ゲートはゼロ件）。プレミアム課金はページ単位のアクセス制限ではなく、既存ページ内のコンテンツ分割（ペイウォール）で処理されている。そのため「認証必須ルートの除外」ロジックは不要で、Cookie有無のみで判定してよい

対象外:
- `matcher` 設定自体の拡張・縮小（既存の除外パターンは維持する）
- Supabase SSRクライアントのトークンリフレッシュ仕様そのものの変更（Cookieが存在する場合の挙動は現行を維持する）

## LLM 連携

なし。

## 受け入れ条件

1. 認証関連Cookieを含まないリクエストに対して、`middleware.ts` 内で `supabase.auth.getUser()` が呼ばれないことを確認するテストがある
2. 認証関連Cookieを含むリクエストに対しては、従来通り `supabase.auth.getUser()` が呼ばれ、トークンリフレッシュが行われることを確認するテストがある
3. （認証必須ルートが存在しないため本項は削除。将来的に追加された場合は別途対応する）
4. `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` が通る

## 未解決の質問

- Supabase SSRクライアントが実際に発行するCookie名のプレフィックス・命名規則は、`@supabase/ssr` のバージョンに依存する可能性がある。実装時に本番Cookieを確認するか、`@supabase/ssr` のドキュメントで正確なCookie名パターンを確認してから判定ロジックを書くこと
- なし（認証必須ルートは調査済みで存在しないことを確認済み）
