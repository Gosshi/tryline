仕様書 `specs/fix-stripe-metadata-userid-validation.md` を実装してください。**先に全文を読んでください。**

PR #762 の DB error 伝播は入っていますが、同 spec が求めた「**検証済み userId**」と「メールを出さない」が未達です。

## 何が壊れているか

`app/api/stripe/webhook/route.ts:102-105` は `metadata.userId` を**非空かどうかしか見ていません。**

そのまま DB と通知へ渡ります（`:138-146`）。`userId` は UUID 列へ書き込まれるので、誤った値だと Postgres が `22P02` で失敗し、**その失敗をきっかけに metadata の値がログと Discord 本文へ転記されます。**

metadata に誤ってメールアドレスが入っていれば、**それが ops チャンネルに出ます。**

再現: `docs/audits/gpt6-spec-review-followup-2026-09-08/stripe-observation.test.ts`。合成した `synthetic-user@example.invalid` と DB の `22P02` を使い、通知関数にその文字列がそのまま渡ることを確認しています。

**Webhook 署名が正しいことは metadata の形式が正しいことを保証しません。** 署名は「Stripe から来た」ことだけを示します。

## やること

`metadata.userId` を UUID として検証し、**検証で弾いてから DB を触る**。不正な値は通知本文に含めない。

代わりに出すのは、安全な分類（例 `invalid_user_id_format`）と `event.id` / `event.type` です。

**「マスクすれば載せてよい」ではありません。** 部分マスクでもメールアドレスは推測できます。載せないでください。

レスポンスは 200 を返して再送を止め、通知で可視化するのを推奨します（形式不正は再送しても直りません）。欠落 `userId` の既存の分岐と揃えてください。

既存テストの正常系 `userId` を UUID の合成値へ変更してください（例 `00000000-0000-4000-8000-000000000001`）。**本物の UUID を使わないでください。**

## やってはいけないこと

- **DB error 時に 500 を返す挙動を変えること**（PR #762 の成果）
- 新しいバリデーションライブラリを追加すること
- イベント順序逆転・ゼロ行 update・欠落 metadata からの復旧に手を出すこと（対象外）
- **Stripe への実通信。** 合成値とモックで完結させてください
- DB への `UPDATE` / `INSERT` / マイグレーション、LLM 呼び出し

git worktree で分けてください（`docs/runbooks/codex-worktree.md`）。
