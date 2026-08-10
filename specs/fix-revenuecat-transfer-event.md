# RevenueCat の TRANSFER イベントで旧ユーザーの権利を失効させる

## 背景

2026-08-10 の RevenueCat 設定作業中に発見した。`app/api/revenuecat/webhook/route.ts` の `HANDLED_EVENT_TYPES`（8〜18行）に **`TRANSFER` が含まれていない**。

RevenueCat の Project settings で「Transferring purchases seen on multiple App User IDs」を **`Transfer to new App User ID`**（既定値、2026-08-10 時点の設定）にしているため、同一 Apple ID の購入が別の App User ID へ移った場合、RevenueCat は `TRANSFER` イベントを送る。

現在の実装ではこれが `HANDLED_EVENT_TYPES` に無いため、121〜123行で 200 を返して**何も書き込まない**。結果として次が起きる。

- **移管元ユーザー（A）の `premium_until` が Supabase に残り続ける。** 権利を失っているのに、期限が来るまで有料コンテンツを読める
- 移管先ユーザー（B）には権利が書き込まれない。ただし B はアプリの復元・ログイン時に `POST /api/v1/me/entitlement/sync` を呼ぶため、実務上は回収される

つまり**実害は A 側の「失効漏れ」に集約される**。返金と同様、課金の整合性に関わる。

有料購読者は本 spec 起票時点で0人のため、現時点の実害はゼロ。**購読者が発生する前に塞ぐ。**

### なぜ transfer behavior を変えないのか

`Keep with original App User ID` にすれば TRANSFER 自体を減らせるが、Apple ID の保有者が復元しても権利が戻らないケースが生まれ、Apple の「購入者は復元できる」という前提と衝突する。**設定は `Transfer to new App User ID` のまま、webhook 側で整合を取る。**

## スコープ

対象:
- `app/api/revenuecat/webhook/route.ts` に `TRANSFER` イベントの処理を追加

対象外:
- RevenueCat ダッシュボードの transfer behavior 変更
- 移管先ユーザーへの権利付与（同期エンドポイントが回収するため。「未解決の質問」を参照）
- 同期エンドポイント `app/api/v1/me/entitlement/sync/route.ts` の変更
- モバイル（`tryline-mobile`）側の変更
- `user_profiles` のスキーマ変更

## データモデル変更

**なし。マイグレーション不要。** 既存の `premium_until` / `premium_source` のみを使う。

## API サーフェス

`app/api/revenuecat/webhook/route.ts` の変更のみ。ルートの追加・削除はない。

### 1. `TRANSFER` を扱うイベントに加える

`HANDLED_EVENT_TYPES`（8〜18行）に `"TRANSFER"` を追加する。

### 2. `TRANSFER` は既存の分岐に乗せない

現在の処理順は「`app_user_id` を UUID 判定 → `getPremiumUntil` → 単一ユーザーを upsert」だが、`TRANSFER` はこの形に合わない。

- `TRANSFER` イベントは **`app_user_id` を持たない場合がある**。代わりに `transferred_from` と `transferred_to` の**配列**を持つ
- `expiration_at_ms` を持たない。よって 130〜137行の `getPremiumUntil` 判定に入ると skip される

**`TRANSFER` は 125行の `app_user_id` 判定より前に分岐させ、専用の処理へ回す。**

### 3. `TRANSFER` の処理内容

```
event.transferred_from: string[]   // 権利を失う App User ID の配列
event.transferred_to:   string[]   // 権利を得る App User ID の配列（本 spec では使わない）
```

- `transferred_from` の各要素について、次を満たす場合のみ `premium_until = 現在時刻` を書いて失効させる
  - `isSupabaseUserId()`（46行）を通る = Supabase の user_id として解決できる
  - `supabase.auth.admin.getUserById()` で実在が確認できる
  - **その profile の `premium_source` が `'apple'` である**
- `premium_source` が `'stripe'` / `'manual'` / `null` の profile は**一切触らない**。Apple 由来でない権利を Apple のイベントで失効させないため。既存の `hasActiveStripeEntitlement`（80〜92行）より厳しい条件になる点に注意
- `transferred_from` が空・未定義・配列でない場合は、書き込まず 200 を返す
- 解決できない ID が混ざっていても、**解決できるものだけ処理して 200 を返す**。1件の失敗で全体を 4xx/5xx にしない（RevenueCat の再送を招くため）
- `transferred_to` は本 spec では**使わない**

### 4. 冪等性

同じ `TRANSFER` を2回受けても結果が変わらないこと。`premium_until = 現在時刻` の上書きは2回目の方が僅かに新しい時刻になるが、いずれも過去〜現在なので `isProfilePremium` は false のままで、**Premium 状態としては冪等**。

## UI サーフェス

なし。

## LLM 連携

なし。

## 受け入れ条件

1. `TRANSFER` イベントを受け取り、`transferred_from` に含まれる `premium_source = 'apple'` のユーザーの `premium_until` が現在時刻に更新され、`isProfilePremium` が false を返す。
2. `transferred_from` に複数の ID が含まれる場合、**解決できるものすべて**が失効する。
3. `transferred_from` のユーザーの `premium_source` が `'stripe'` の場合、`premium_until` も `premium_source` も**変更されない**。
4. 同じく `premium_source` が `null` の場合も変更されない。
5. `transferred_from` が空配列・未定義でも 200 を返し、書き込みが発生しない。
6. `transferred_from` に Supabase user として解決できない ID（RevenueCat 匿名 ID 等）が含まれていても 200 を返し、解決できる他の ID の処理は実行される。
7. `TRANSFER` イベントで `expiration_at_ms` が無くても skip されない（現行の `getPremiumUntil` 経路に入らない）。
8. 同じ `TRANSFER` イベントを2回送っても、以後 `isProfilePremium` が false のまま変わらない。
9. 既存イベント（`INITIAL_PURCHASE` / `RENEWAL` / `EXPIRATION` / `REFUND` 等）の挙動が変わっていない。既存テストがすべて通る。
10. `Authorization` ヘッダ不一致で 401 を返す挙動が変わっていない。
11. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` / `pnpm build` clean。

## 未解決の質問

1. **`transferred_to` への権利付与を webhook で行うか。** 本 spec では行わない。理由は、`TRANSFER` イベントが有効期限を含まないため、付与するには webhook から RevenueCat REST API を呼んで subscriber 情報を取得する必要があり、`REVENUECAT_SECRET_API_KEY` への依存と外部 API 呼び出しが webhook 経路に増えるため。移管先ユーザーは、アプリが復元・ログイン時に呼ぶ同期エンドポイントで回収される（`src/purchases/PurchasesProvider.tsx` の `restore()` / `purchase()` が `syncEntitlement()` を呼ぶ）。

   **残るギャップ**: 移管先ユーザーがアプリを開かない限り、サーバー側では Premium にならない。実務上は「復元操作をした本人」が移管先なので、その操作の直後に同期が走る。問題が観測されたら本 spec の対象外として別途起票する。

2. **`transferred_from` / `transferred_to` のフィールド名と型の実データ確認。** 実装前に RevenueCat のドキュメントで最新のペイロード構造を確認すること。本 spec は「配列である」前提で書いているが、**実データが単一文字列だった場合は実装を止めて報告する**こと。
