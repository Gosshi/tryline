# Codex 指示: ログインモーダルでメールアドレスが送信できない問題を修正

## 仕様書

`specs/fix-auth-modal-email-validation.md` を読んでから着手すること。以下は補足であり、仕様の置き換えではない。

## 何が壊れているか（一文）

`components/auth-modal.tsx:29` が入力値を trim せずそのまま `signInWithOtp` に渡しており、オートフィルやコピー＆ペーストで前後に空白が混じると Supabase が 400 `Unable to validate email address: invalid format` を返してログインできない。

**本番の実測ログ（2026-08-16 02:52、12 秒間に 21 件以上）で確認済み。推測ではない。**

## 先に実読すべきファイル

| ファイル | 何を確認するか |
|---|---|
| `components/auth-modal.tsx:17-48` | `email` state、`submit()`、`handleGoogleLogin()`。**trim なし・エラー破棄・二重送信防止なし** |
| `components/auth-modal.tsx:67-80` | 現在のエラー表示（`state === "error"` で固定文言） |
| `tests/components/auth-modal.test.tsx` | 既存テストは 2 件のみ（コピーの描画確認）。書き方の参考にする |
| `lib/auth/client.ts` | `getSupabaseBrowserClient` の設定。**自動リトライの有無を確認**（仕様書の未解決の質問 3） |

## 直すのは 4 点

1. **trim する** — 半角空白だけでなく、全角空白・改行・タブも除去する
2. **送信前にバリデーション** — 空・`@` なし等は API を呼ばずに弾く
3. **エラーを具体的に表示** — いまは `setState(error ? "error" : "sent")` で内容を捨てている
4. **二重送信を防ぐ** — 送信中はボタンを無効化する

## 絶対にやってはいけないこと

1. **アカウントの存在有無が分かる文言を出さない。** 「そのアドレスは登録されていません」「アカウントが見つかりません」は**禁止**。Supabase の `signInWithOtp` は存在しないアドレスにも成功を返す設計（ユーザー列挙対策）で、これを画面で崩してはいけない
2. **バリデーションを厳しくしすぎない。** 正規表現で RFC 準拠を目指さないこと。`user+tag@example.co.jp` のような正常なアドレスを弾く実装は、今回の不具合を別の形で再発させる。**「明らかにおかしいものだけ弾く」で十分**
3. **認証方式を変えない。** Magic Link / OTP / Google OAuth の構成はそのまま
4. **Supabase の設定に触れない。** メールテンプレート・Redirect URLs・SMTP は今回の原因ではない
5. **`app/auth/callback/route.ts` を触らない**
6. **未知のエラーで画面を壊さない。** 判定できないエラーは従来の汎用メッセージにフォールバックする

## 入出力の具体例

### trim
```
"  user@example.com  "   → "user@example.com" が送信される
"user@example.com\n"     → "user@example.com"
"　user@example.com　"    → "user@example.com"（全角空白）
```

### 送信前バリデーション（API を呼ばない）
```
""            → エラー表示、fetch 発生なし
"   "         → エラー表示、fetch 発生なし
"userexample" → エラー表示、fetch 発生なし
```

### 通すべきアドレス（弾いてはいけない）
```
"user+tag@example.co.jp"
"first.last@sub.example.com"
```

### エラー表示
```
400 invalid format → 「メールアドレスの形式が正しくありません」相当
429                → 「時間をおいてお試しください」相当
それ以外            → 従来の汎用メッセージ
```

## テストの書き方

既存の `tests/components/auth-modal.test.tsx` は描画確認 2 件しかない。**Supabase クライアントをモックして、渡された引数を検証すること。**

最低限、以下を確認する（仕様書の受け入れ条件 1・4・5・7・12 に対応）:

- trim された値が `signInWithOtp` に渡ること（**引数の中身を assert する**。呼ばれたことだけ確認して終わらない）
- 空文字では `signInWithOtp` が**呼ばれない**こと
- 400 形式エラーで具体的なメッセージが描画されること
- 送信中にボタンが disabled になり、連続クリックで 2 回呼ばれないこと

## 完了の定義

- `specs/fix-auth-modal-email-validation.md` の受け入れ条件 1〜16 を満たす
- 変更ファイル: `components/auth-modal.tsx` / `tests/components/auth-modal.test.tsx`
- `pnpm test` と型チェックが green
- **本番での確認（受け入れ条件 17）は実施しない。** Owner が行う
- PR 本文に、エラー種別の判定を Supabase の `error` のどのフィールドで行ったかを 1 行で書くこと
