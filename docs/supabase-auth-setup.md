# Supabase Auth セットアップ手順

pr18（Auth + Stripe）実装後に Owner が手動で行う設定。
Magic Link によるログインを本番環境で動かすために必要。

---

## 1. Site URL の設定

1. Supabase Dashboard → プロジェクトを選択
2. `Authentication` → `URL Configuration`
3. **Site URL** を設定:
   ```
   https://tryline-six.vercel.app
   ```

---

## 2. Redirect URLs に追加

同じ `URL Configuration` 画面で **Redirect URLs** に追加:

```
https://tryline-six.vercel.app/auth/callback
```

ここを設定しないと Magic Link クリック後に「redirect_uri_mismatch」エラーになりログインできない。

ローカル開発用にも追加しておくと便利:
```
http://localhost:3000/auth/callback
```

---

## 3. マイグレーションの本番適用

pr18 で追加された以下 2 本を本番 DB に適用する:

```bash
supabase db push
```

対象:
- `20260507090000_add_chat_tables.sql` — `chat_sessions`・`chat_messages`
- `20260507100000_add_user_profiles.sql` — `user_profiles` + `handle_new_user` トリガー

適用後、Supabase Dashboard の `Table Editor` で両テーブルが存在することを確認する。

---

## 4. 動作確認

1. ヘッダーに「ログイン」ボタンが表示されることを確認
2. メールアドレスを入力して Magic Link を送信
3. 受信メールのリンクをクリック → `/` にリダイレクトされてログイン状態になることを確認
4. Supabase Dashboard → `Authentication` → `Users` にユーザーが追加されていることを確認
5. `user_profiles` テーブルに同じ `id` のレコードが自動作成されていることを確認（`handle_new_user` トリガーの動作確認）

---

## 参照

- 仕様書: `specs/p2-auth.md`
- 実装: `lib/auth/server.ts`, `lib/auth/client.ts`, `app/auth/callback/route.ts`
- Stripe 設定: `docs/stripe-setup.md`
