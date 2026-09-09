# fix-stripe-metadata-userid-validation

> 2026-09-08 再レビュー R5（P2）。`specs/fix-stripe-webhook-db-error-propagation.md`（PR #762）の DB error 伝播は入ったが、同 spec が求めた「**検証済み userId**」と「メールを出さない」が未達である。

## 背景

`app/api/stripe/webhook/route.ts:102-105`。

```typescript
const subscription = event.data.object as Stripe.Subscription;
const userId = subscription.metadata?.userId;

if (!userId) {
```

**非空かどうかしか見ていない。** そのまま DB と通知へ渡る（`:138-146`）。

```typescript
if (error) {
  await reportDatabaseWriteFailure({ event, issueCode: "subscription_upsert_failed", userId });
  return new Response("Database write failed", { status: 500 });
}
```

`userId` は UUID 列へ書き込まれるため、誤った値が入っていると Postgres が `22P02`（invalid text representation）で失敗する。**その失敗をきっかけに、metadata の値がそのままログと Discord 本文へ転記される。**

metadata に誤ってメールアドレスや外部 ID が入っていた場合、**それが ops チャンネルに出る。**

再レビューは合成した `synthetic-user@example.invalid` と DB の `22P02` を用い、通知関数にその文字列がそのまま渡ることを再現した（`docs/audits/gpt6-spec-review-followup-2026-09-08/stripe-observation.test.ts`）。実際の個人情報や Stripe への接続は使っていない。

**Webhook 署名が正しいことは、metadata の形式が正しいことを保証しない。** 署名は「Stripe から来た」ことだけを示す。

## スコープ

対象:
- `app/api/stripe/webhook/route.ts`: `metadata.userId` を UUID として検証する
- 検証に失敗した値を**通知本文に含めない**
- `lib/llm/notify.ts:413` 付近: 通知が受け取る値の境界を明確にする
- 既存テストの正常系 `userId` を UUID の合成値へ変更する
- テスト

対象外:
- **DB error の伝播そのもの**（PR #762 で実装済み。500 を返す挙動は変えない）
- 未対応 `event.type` の先行判定（実装済み）
- **イベント順序の逆転・ゼロ行 update・欠落 metadata からの復旧**。`fix-stripe-webhook-db-error-propagation.md` に対象外として明記済み
- RevenueCat 経路
- Stripe への実通信。**テストは合成値とモックで完結させる**
- DB への `UPDATE` / `INSERT` / マイグレーション

## データモデル変更 / UI

なし。

## API サーフェス

`app/api/stripe/webhook` のレスポンス。**不正な `userId` に対して何を返すかを決める必要がある。**

Stripe は 2xx 以外を再送する。形式不正の metadata は再送しても直らないため、**再送させても意味がない**。一方で黙って 200 を返すと問題が埋もれる。

**推奨**: 200 を返して再送を止め、**通知で可視化する**。欠落 `userId` の既存の扱い（`:105` の分岐）と揃えること。

## LLM 連携

なし。コスト $0。

## 変更詳細

### 1. UUID 検証

`metadata.userId` が UUID の形式であることを検証する。既存の検証ヘルパーがあればそれを使い、無ければ最小限の実装にする。**新しいバリデーションライブラリを入れないこと。**

### 2. 通知に載せるもの

検証に失敗した場合、**その値自体を通知に含めない**。代わりに次を出す。

- 安全な分類（例: `invalid_user_id_format`）
- `event.id` と `event.type`
- 値の長さや形式の概略まで。**生の文字列は出さない**

**「マスクすれば載せてよい」ではない。** 部分マスクでもメールアドレスは推測できる。載せない。

### 3. 既存テスト

正常系の `userId` が UUID でない合成値になっている箇所を、UUID の合成値へ変更する。**本物の UUID を使わないこと**（例: `00000000-0000-4000-8000-000000000001`）。

## 受け入れ条件

**テスト実行の条件**: `tests/api/` は `vitest.config.ts:16` の `exclude` に該当しない。**既定の `pnpm test` で実行される。** 結果を PR 本文に貼る。

1. **回帰テスト（必須）**: `metadata.userId` が `synthetic-user@example.invalid` のとき、**その文字列が通知関数へ渡らない**ことを検証する。`docs/audits/gpt6-spec-review-followup-2026-09-08/stripe-observation.test.ts` が現在の誤った挙動を再現しているので、期待値を書き換えて回帰テストにする
2. 不正な `userId` で DB への書き込みを試みないことを検証するテストがある。**検証で弾いてから DB を触る**
3. 正常な UUID では従来どおり処理が進むことを検証するテストがある
4. `userId` が欠落している既存ケースの挙動が変わっていない
5. **DB error 時に 500 を返す挙動が変わっていない**（PR #762 の成果を壊さない）
6. 通知本文に `event.id` と `event.type` が含まれ、**生の metadata 値が含まれない**
7. 既存テストの正常系 `userId` が UUID の合成値になっている
8. 新しい依存パッケージを追加していない
9. DB への `UPDATE` / `INSERT` / マイグレーションが差分に含まれない
10. LLM 呼び出しが差分に含まれない
11. `pnpm lint` / `pnpm typecheck` / `pnpm test` が green

**Stripe への実通信を行わないこと。** テストは合成値とモックで完結させる。

## 未解決の質問

**Owner が決めること（実装をブロックしない）:**

1. **不正 metadata を受けたときの復旧手順。** 通知で気づいた後、Stripe 側の metadata を直すのか、DB を手で埋めるのか。本 spec は可視化までを扱う

**本 spec で解決しないと明示するもの**:

- **metadata が壊れた購読は自動では復旧しない。** 通知が出るだけである
- **イベント順序の逆転は引き続き対象外。** 署名検証と metadata 検証は、順序の正しさを保証しない
