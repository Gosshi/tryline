`specs/fix-revenuecat-transfer-event.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 過去の判断は `docs/decisions.md` を読む（**D015** が iOS IAP の RevenueCat 採用を決定している）
- 背景: `app/api/revenuecat/webhook/route.ts` の `HANDLED_EVENT_TYPES`（8〜18行）に `TRANSFER` が無い。RevenueCat の transfer behavior は `Transfer to new App User ID`（2026-08-10 に設定確認済み）なので、同一 Apple ID の購入が別ユーザーへ移ると `TRANSFER` が飛ぶが、現在は 121〜123行で 200 を返して何も書かない。**結果、移管元ユーザーが権利を失ったのに Supabase 上は Premium のまま残る**
- 有料購読者は0人のため現時点の実害はゼロ。**購読者が出る前に塞ぐのが目的**

**着手前に必ず行うこと**: RevenueCat の公式ドキュメントで `TRANSFER` イベントのペイロード構造を確認する。本 spec は `transferred_from` / `transferred_to` が**文字列の配列**である前提で書いている。**実データの型が違う場合は実装を止めて報告する**こと（`specs/*.md` は書き換えない）。

参考にする既存パターン:
- **失効系イベントの分類**: 同ファイル20行の `REVOCATION_EVENT_TYPES`。`TRANSFER` は「配列を扱う」点で性質が違うので、この Set には**入れずに別分岐**にする
- **Supabase user_id の判定**: 同ファイル46行の `isSupabaseUserId()`。匿名 ID（`$RCAnonymousID:...`）を弾くためにそのまま流用する
- **ユーザー実在確認**: 同ファイル141行の `supabase.auth.admin.getUserById()`
- **profile の取得と書き込み**: 同ファイル152〜175行（`select("premium_source, premium_until")` → `upsert`）
- **`premium_source` のガード**: 同ファイル80〜92行の `hasActiveStripeEntitlement`。**ただし TRANSFER ではより厳しく「`premium_source === 'apple'` のときだけ書き込む」条件にする**

エッジケース:
- **`TRANSFER` は `app_user_id` を持たない場合がある。** 125行の `app_user_id` UUID 判定より**前**に分岐させること。後ろに置くと skip される
- **`TRANSFER` は `expiration_at_ms` を持たない。** 130〜137行の `getPremiumUntil` 経路に入れると「missing expiration_at_ms」で skip される。この経路を通さないこと
- `premium_source` が `'stripe'` / `'manual'` / `null` の profile は**一切触らない**。Apple 以外の由来の権利を Apple のイベントで失効させない
- `transferred_from` が空配列・未定義・配列でない場合は、書き込まず 200 を返す
- **配列に解決できない ID が混ざっていても、解決できるものだけ処理して 200 を返す。** 1件の失敗で 4xx/5xx を返すと RevenueCat が再送を繰り返す
- 複数 ID の処理中に1件が DB エラーになった場合の扱いを決める。**全体を落として再送させるか、残りを処理して 200 にするか**を選び、選んだ理由をコメントか PR 説明に書く
- 冪等性: 2回受けても `isProfilePremium` が false のまま変わらないこと（`premium_until = 現在時刻` の再書き込みは許容）

やらないこと:
- `transferred_to` への権利付与（同期エンドポイントが回収する。spec の「未解決の質問1」を参照）
- `app/api/v1/me/entitlement/sync/route.ts` の変更
- `REVENUECAT_SECRET_API_KEY` を webhook 経路で使うこと
- 既存イベント（`INITIAL_PURCHASE` / `RENEWAL` / `EXPIRATION` / `REFUND` 等）の挙動変更
- `isProfilePremium` / `lib/auth/server.ts` の変更
- `user_profiles` のマイグレーション作成
- `subscription_status` カラムへの書き込み（Stripe 専用で、どこからも読まれていない）
- `docs/decisions.md` / `specs/*.md` / `CLAUDE.md` / `AGENTS.md` の変更（AGENTS.md:180-181 で禁止）
- `tryline-mobile` 側のファイル変更

完了の定義:
- spec の受け入れ条件1〜11をすべて満たす
- テストを追加する。最低限、次の6ケース
  1. `premium_source = 'apple'` のユーザーが失効し、`isProfilePremium` が false になる
  2. `transferred_from` に複数 ID があるとき、解決できるものすべてが失効する
  3. `premium_source = 'stripe'` のユーザーが**変更されない**
  4. `premium_source = null` のユーザーが**変更されない**
  5. `transferred_from` が空・未定義で 200 かつ書き込みなし
  6. 解決できない ID が混ざっていても 200 で、解決できる ID は処理される
- **既存テスト（`tests/api/revenuecat-webhook.test.ts`）がすべて通ること**を確認する
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean
- 変更ファイル一覧を報告する

完了時:
- 実装内容を要約する
- **RevenueCat のドキュメントで確認した `TRANSFER` ペイロードの構造を、参照 URL と合わせて報告する**
- spec の受け入れ条件を1項目ずつ、満たしたことをどう確認したかと合わせて報告する（「CI green」だけの報告は不可）
- 複数 ID 処理中の DB エラーの扱いについて、選んだ方針と理由を報告する
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する
