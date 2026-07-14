# Codex プロンプト: fix-chat-counter-service-role

tryline リポジトリで貼る。

---

`/specs/fix-chat-counter-service-role.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 対象は `app/api/chat/[matchId]/route.ts` のカウンタ書き込み 2 箇所と、grant 縮小マイグレーション 1 本のみ
- service role クライアントの生成は `app/api/v1/me/route.ts` の `getSupabaseAdminClient` パターンを参照
- grant テストの書き方は `tests/db/premium-entitlement.test.ts` を参照

エッジケース:
- service role は RLS を通らない。カウンタ更新の `.eq("id", ...)` が認証済みユーザーの `user.id` であることをテストで担保（別ユーザー行への書き込み防止）
- 日付リセット（`chat_daily_reset_date`）の既存ロジックは挙動を変えない

完了の定義: 受け入れ条件 1〜5 のテスト、`pnpm test`・`pnpm build` pass。チャットの無料枠回数・UI・LLM 呼び出しに変更がないこと。**マイグレーションの本番適用は Owner が行う**。

---

## 委譲後の流れ（Owner 向けメモ）

1. Codex に貼る → PR → `codex-review` → マージ → Owner が `supabase db push --linked` → デプロイ確認
2. 適用後、Web でお気に入り変更とチャット送信が正常なことを軽く確認
