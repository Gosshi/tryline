# p2-auth: ユーザー認証

## 背景

Stripe 課金・AI チャット・お気に入り機能はすべてユーザー識別が前提となる。
パスワードレスの magic link を第一手段とし、日本ユーザーの摩擦を最小化する。
Google OAuth を第二手段として用意する。

## スコープ

対象:
- Magic link 認証（Supabase Auth）
- Google OAuth（Supabase Auth provider）
- ログインモーダル UI
- サイトヘッダーへのユーザーメニュー追加
- ログイン後リダイレクト処理
- `user_profiles` テーブル（購読状態管理の土台）

対象外:
- Stripe 課金（p2-stripe-subscription.md で扱う）
- ソーシャル機能・フォロー
- メール配信オプトイン

## データモデル変更

### 新規テーブル: `user_profiles`

| カラム | 型 | 説明 |
|---|---|---|
| id | uuid PK | `auth.users.id` 参照 |
| display_name | text | 任意の表示名 |
| subscription_status | text | `'free'` / `'premium'` / `'cancelled'` |
| created_at | timestamptz | 作成日時 |
| updated_at | timestamptz | 更新日時 |

RLS: 本人のみ read/update 可。

新規サインアップ時に `handle_new_user()` トリガーで自動作成。

## API サーフェス

| ルート | メソッド | 役割 |
|---|---|---|
| `/auth/callback` | GET | Magic link / OAuth コールバック処理（code exchange） |
| `/api/auth/signout` | POST | サインアウト（セッション削除） |

### 新規ファイル

- `app/auth/callback/route.ts` — Supabase Auth code exchange
- `lib/auth/server.ts` — `getUser()`, `requireUser()` サーバーヘルパー
- `lib/auth/client.ts` — `createBrowserClient()` ラッパー

## UI サーフェス

### ログインモーダル（`components/auth-modal.tsx`）

状態遷移:
1. `idle` — メールアドレス入力フォーム + 送信ボタン
2. `sent` — 「メールを送りました」メッセージ
3. `error` — エラーメッセージ

### ユーザーメニュー（`components/user-menu.tsx`）

- 未ログイン: 「ログイン」ボタン → モーダル表示
- ログイン済み: アバター + ドロップダウン（プロフィール / サインアウト）

### ヘッダー統合（`components/site-header.tsx`）

右端にユーザーメニューを追加。現状のナビゲーション構造は変えない。

## 受け入れ条件

- [ ] メールアドレスを入力すると magic link が届く
- [ ] リンクをクリックするとログイン状態になり元のページに戻る
- [ ] ページ再読み込み後もログイン状態が維持される
- [ ] サインアウトで未ログイン状態に戻る
- [ ] サインアップ時に `user_profiles` が自動作成される
- [ ] RLS により他ユーザーのプロフィールは読めない
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

- Google OAuth を MVP に含めるか（magic link のみでも十分か）
- ログイン後リダイレクト先: 元ページ維持 or トップ固定
