# feat-premium-entitlement-refactor: Premium 判定の決済事業者非依存化

## 背景

D014（iOS アプリ昇格）により、将来 Apple IAP（v1.1）や手動付与など複数の決済・付与経路が生まれる。現在の Premium 判定は `lib/auth/server.ts` の `isPremium()` が `user_profiles.subscription_status === "premium"` を見る Stripe 直結の実装であり、決済事業者を追加するたびに判定ロジックが分岐してしまう。

本 spec は Premium 判定を「いつまで Premium か（`premium_until`）」＋「どの経路で付与されたか（`premium_source`）」という決済非依存の entitlement に再設計する。iOS アプリ本体より先に単独で完了でき、Web 単体でも価値がある（アプリが中止になっても無駄にならない）。

**あわせて修正するセキュリティ問題（発見・本番実測で確認: 2026-07-14）**: `supabase/migrations/20260507100000_add_user_profiles.sql` の RLS ポリシーは `create policy "own profile" on user_profiles for all using (auth.uid() = id)` であり、本番の `information_schema.role_table_grants` の実測で `authenticated`（および `anon`）に `user_profiles` へのテーブルレベル UPDATE がフル付与されていることを確認済み。つまり**ログインユーザーが supabase-js から自分の `subscription_status` を `'premium'` に直接書き換えられる**。entitlement カラム追加と同時に、課金関連カラムをユーザー自身が更新できないようカラムレベルで保護する。

**あわせて修正する webhook バグ（発見・本番実測で確認: 2026-07-14）**: `app/api/stripe/webhook/route.ts:58-60` は `(subscription as ... { current_period_end?: number }).current_period_end` というキャストで期間終了日時を取り出しているが、現行の Stripe API バージョンでは `current_period_end` は subscription オブジェクトではなく **subscription item**（`subscription.items.data[*].current_period_end`）に存在するため、常に `undefined` → DB に null が書かれる。本番実測でも Stripe 連携済みの premium 行の `current_period_end` が null だった。**このバグを直さずに `premium_until = current_period_end` へ移行すると、Stripe 契約者全員が非 Premium 判定になる**ため、本 spec で同時に修正する。

## スコープ

対象:
- `user_profiles` への `premium_until` / `premium_source` カラム追加とバックフィル
- `isPremium()` と全読み取り箇所の書き換え
- Stripe webhook の書き込み変更
- 課金関連カラムのカラムレベル権限保護（セキュリティ修正）

対象外:
- Apple IAP / App Store Server Notifications V2 の実装（v1.1 の別 spec）
- 手動付与（`manual`）の管理 UI・運用フロー（値の定義のみ行う）
- UI の見た目変更（表示条件のロジック差し替えのみ）
- `subscription_status` カラムの削除（後方互換のため残す。削除は別 spec）

## データモデル変更

### マイグレーション 1: カラム追加

```sql
alter table user_profiles
  add column premium_until timestamptz,
  add column premium_source text
    check (premium_source in ('stripe', 'apple', 'manual'));
```

### マイグレーション 2: バックフィル

**本番実測（2026-07-14）**: `subscription_status = 'premium'` は 2 行のみで、**2 行とも `current_period_end` が null**（1 行は Stripe 連携なし、1 行は Stripe 連携ありだが上記 webhook バグにより期間未記録）。**2 行とも Owner のテストアカウントであることを Owner 確認済み（2026-07-14）**。実顧客への影響はゼロ。`'free'` / `'cancelled'` を含む他の行は存在しない。

バックフィルルール:
- `subscription_status = 'premium'` かつ `current_period_end is not null` の行: `premium_until = current_period_end`, `premium_source = 'stripe'`（実測では 0 件だが、適用時点で増えている可能性に備える）
- `subscription_status = 'premium'` かつ `current_period_end is null` の行（実測 2 件）: `premium_until = now() + interval '1 year'`, `premium_source = 'manual'` として Premium を維持する。Stripe 連携ありの行は webhook バグ修正後、次回の `customer.subscription.updated` イベントで正しい `premium_until` / `premium_source = 'stripe'` に自動上書きされる
- `'free'` / `'cancelled'` の行: 両カラムとも null のまま

### マイグレーション 3: カラムレベル権限保護（セキュリティ修正）

`authenticated` ロールの `user_profiles` に対する UPDATE をカラム単位に制限する:

```sql
revoke update on user_profiles from authenticated;
grant update (display_name, favorite_team_slugs, chat_daily_count, chat_daily_reset_date)
  on user_profiles to authenticated;
```

- `subscription_status` / `stripe_customer_id` / `stripe_subscription_id` / `current_period_end` / `premium_until` / `premium_source` は grant 対象に含めない（service role の webhook / サーバー処理のみが更新可能）
- 既存の RLS ポリシー `"own profile"` は変更しない（行レベルの制約はそのまま）
- 注意: `grant update` の対象カラムは、上記以外にユーザー自身の更新を前提とするカラムが `user_profiles` に追加されていないか、実装時点のスキーマ（`lib/db/types.ts` の `user_profiles`）を確認してから確定する

## API サーフェス

新規ルートなし。既存の判定ロジックを差し替える。

### `lib/auth/server.ts`

- `getUserProfile()` の select に `premium_until` を追加
- `isPremium(userId)` の判定を `premium_until` ベースへ変更:

```
premium = profile.premium_until != null && new Date(profile.premium_until) > new Date()
```

- 同一判定を profile オブジェクトから直接行う純関数 `isProfilePremium(profile)` をエクスポートし、下記の読み取り箇所のインライン比較を置き換える（判定ロジックの一元化）

### 読み取り箇所の書き換え（2026-07-14 時点の全箇所）

| ファイル | 現在 | 変更後 |
|---|---|---|
| `lib/auth/server.ts:65` | `subscription_status === "premium"` | `premium_until` 判定 |
| `app/page.tsx:204,294` | `profile?.subscription_status !== "premium"` | `!isProfilePremium(profile)` |
| `components/site-header.tsx:22` | `subscription_status === "premium"` | `isProfilePremium(profile)` |

`app/api/me/premium/route.ts`・`app/api/matches/[id]/recap-locked/route.ts`・チャット無料枠（`app/api/me/chat-free/[matchId]/route.ts`）は `isPremium()` 経由のため関数差し替えで自動的に追従する。実装時に `grep -rn "subscription_status" app lib components` で読み取り箇所が増えていないか再確認すること。

### `app/api/stripe/webhook/route.ts` の書き込み変更

- **期間終了日時の取得バグ修正（必須・先行）**: `route.ts:58-60` のキャストを廃止し、`subscription.items.data[0].current_period_end`（現行 Stripe API での所在）から取得する。トップレベルに `current_period_end` が存在する古い API バージョンのイベントにも対応できるよう、トップレベル → items の順のフォールバックとし、どちらも無い場合は null を書いてサーバーログに warn を出す（silent fallback にしない）
- subscription created/updated 時: 既存の `subscription_status` / `current_period_end` 書き込みに加え、`premium_until = <取得した期間終了日時>`, `premium_source = 'stripe'` を書き込む（`getSubscriptionStatus()` が `'premium'` を返す場合のみ。`'free'` の場合は `premium_until = null`, `premium_source = null`）
- subscription deleted 時: 既存の `subscription_status = 'cancelled'` に加え、`premium_until = null`, `premium_source = null`

現行の挙動（`active`/`trialing` のみ premium、deleted イベントで即座に非 premium）と厳密に一致させる。

### 型の再生成

`lib/db/types.ts` を再生成し、`premium_until` / `premium_source` を反映する。

## UI サーフェス

変更なし（表示条件の判定ロジック差し替えのみ。表示内容・文言は不変）。

## LLM 連携

なし。LLM 呼び出しの追加はゼロ、コスト影響なし。

## 受け入れ条件

1. `premium_until` が未来日時の profile に対し `isPremium()` が `true` を返す
2. `premium_until` が過去日時 / null の profile に対し `isPremium()` が `false` を返す
3. Stripe webhook の subscription updated イベント（`status: 'active'`、`items.data[0].current_period_end` あり・トップレベル `current_period_end` なしの現行 API 形式ペイロード）処理後、該当行の `premium_until` が **null でなく** items の期間終了日時と一致し、`premium_source = 'stripe'` になる（`'trialing'` も同様）。トップレベルに `current_period_end` を持つ旧形式ペイロードでも同じ結果になる
4. Stripe webhook の subscription deleted イベント処理後、`premium_until` / `premium_source` が null になり、`isPremium()` が `false` を返す
5. バックフィル後、既存の premium 2 行（2026-07-14 実測・いずれも `current_period_end` null）が `premium_source = 'manual'`・`premium_until = 適用時刻 + 1 年` となり、`isPremium()` が `true` を維持する（変更前後で premium 判定される行数が一致する）
6. `authenticated` ロールのクライアント（supabase-js + ユーザー JWT）から `premium_until` / `premium_source` / `subscription_status` / `stripe_customer_id` の UPDATE を試みるとエラーになる（テストで検証）
7. `authenticated` ロールから `display_name` / `favorite_team_slugs` の UPDATE は引き続き成功する（お気に入り機能のリグレッションなし）
8. `grep -rn "subscription_status" app lib components` の結果、gating 目的の読み取りが残っていない（webhook の書き込みと型定義のみ）
9. 上記 1〜7 の単体・統合テストが追加され、既存テストが全て pass する

### 本番適用手順（受け入れ条件に含む）

- マイグレーション適用前に、本番の `user_profiles` の `subscription_status` 別件数と `current_period_end is null` の premium 行件数を read-only クエリで記録する
- 適用後、`isPremium()` 相当のクエリで premium 判定される行数が適用前と一致することを確認する

## 未解決の質問

1. マイグレーション 3 の `grant update` 対象カラム: 実装時点のスキーマで、ユーザー自身の更新を前提とする列が他にないかの確認（Codex が実装時に列挙し、疑わしい列があれば Owner に確認）
2. `premium_source = 'manual'` の付与手段（管理スクリプト or SQL 手順書）はどこまで用意するか — 本 spec では値の定義のみ。必要になった時点で別途起票
