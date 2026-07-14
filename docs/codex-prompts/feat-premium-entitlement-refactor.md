# Codex プロンプト: feat-premium-entitlement-refactor

Owner がそのまま Codex に貼るプロンプト。

---

`/specs/feat-premium-entitlement-refactor.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む（Codex 向けの規約ファイル。`CLAUDE.md` は Claude Code 向けなので参照しない）
- システム設計は `/docs/architecture.md`、過去の判断は `/docs/decisions.md`（特に D014）を読む
- 対象の現行実装: `lib/auth/server.ts`（`isPremium` / `getUserProfile`）、`app/api/stripe/webhook/route.ts`、`supabase/migrations/20260507100000_add_user_profiles.sql`
- 読み取り箇所の書き換え対象は仕様書の表のとおり（`app/page.tsx`・`components/site-header.tsx`）。着手時に `grep -rn "subscription_status" app lib components` で増えていないか再確認する

入出力の具体例:

1. webhook（現行 Stripe API 形式: `current_period_end` が items 側にのみ存在）
   - 入力イベント: `customer.subscription.updated`, `status: "active"`, `metadata.userId: "<uuid>"`, `items.data[0].current_period_end: 1767139200`（トップレベルに `current_period_end` なし）
   - 期待される行: `subscription_status = 'premium'`, `current_period_end = '2025-12-31T00:00:00.000Z'`, `premium_until = 同値`, `premium_source = 'stripe'`
2. Premium 判定
   - `premium_until = '2027-01-01T00:00:00Z'`（未来）→ `isPremium()` は `true`
   - `premium_until = null` または過去 → `false`

Codex が処理すべきエッジケース:
- webhook ペイロードの新旧両形式（トップレベル `current_period_end` あり / items のみ）。どちらも無い場合は null を書き、サーバーログに warn（silent fallback 禁止）
- `getSubscriptionStatus()` が `'free'` を返すステータス（`past_due` 等）の updated イベント → `premium_until = null`, `premium_source = null`
- バックフィル: 本番の premium 2 行はいずれも `current_period_end` null（仕様書の実測メモ参照）。`premium_source = 'manual'`, `premium_until = now() + interval '1 year'` で Premium 維持
- カラムレベル grant 変更後も、既存の `app/api/user/profile/route.ts`（cookie 認証の authenticated ロール経由）による `favorite_team_slugs` 更新が壊れないこと
- `grant update` の対象カラムは実装時点の `user_profiles` 全カラムを列挙して確定する。ユーザー自身の更新を前提とするか疑わしいカラムがあれば、実装を止めて Owner に確認する

要件:
- 受け入れ条件セクションのすべてを実装する
- 「スコープ対象外」にある項目は実装しない（Apple IAP・`subscription_status` カラム削除・UI 文言変更はやらない）
- 受け入れ条件項目に対するテストを書く（`tests/api`・`tests/db` の既存構成に倣う）
- マイグレーションは `supabase/migrations/` の既存命名規則（UTC タイムスタンププレフィックス）に従って追加する。**本番への適用は Owner が行うので、Codex は適用しない**
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、実装を進めずその場で停止して Owner に確認する（`AGENTS.md` の「実装を停止すべきケース」参照。実装し終えてから末尾で質問しない）

完了の定義:
- マイグレーション 3 本（カラム追加 / バックフィル / grant 変更）が追加されている
- `isPremium()` が `premium_until` ベースになり、`isProfilePremium()` が全読み取り箇所で使われている
- webhook が新旧両形式で `premium_until` を正しく書く
- 受け入れ条件 1〜9 のテストが追加され、`pnpm test` と `pnpm build` が全て pass する
- 実装内容・変更ファイルの要約、仕様書からの逸脱（あれば理由）、未解決の質問を報告する

---

## 委譲後の流れ（Owner 向けメモ）

1. 上記を Codex に貼る
2. 実装が返ってきたら Claude Code の `codex-review` スキルでレビュー（仕様書照合＋RLS/grant 変更の安全確認）
3. マージ後、マイグレーション適用は仕様書「本番適用手順」の read-only 事前記録 → 適用 → 事後確認の順で Owner が実施
4. 次は `specs/feat-mobile-api-v1.md` を委譲（本 spec の完了が前提）
