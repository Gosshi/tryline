# Google ソーシャルログイン追加

## 背景

現在の認証手段は Magic Link（メールアドレス入力）のみ。
Google ログインを追加することで、初回ログインの摩擦を下げ、
コンバージョン率の向上を狙う。
Supabase Auth は Google OAuth を標準サポートしているため実装コストは低い。

## スコープ

対象:
- `components/auth-modal.tsx`（または認証フォームコンポーネント）— Google ログインボタン追加
- `app/auth/callback/route.ts` — OAuth コールバック処理の確認・対応

対象外:
- GitHub / Twitter 等の他ソーシャルプロバイダ（今回は Google のみ）
- 既存の Magic Link フロー（変更なし）
- Supabase ダッシュボード・Google Cloud Console の設定（Owner が実施）

## 前提条件（Owner が事前に設定）

1. Google Cloud Console でプロジェクトの OAuth 2.0 クライアント ID を作成
   - 承認済みリダイレクト URI に Supabase の Callback URL を追加:
     `https://<project-ref>.supabase.co/auth/v1/callback`
2. Supabase ダッシュボード → Authentication → Providers → Google を有効化し
   Client ID / Client Secret を設定

## UI 変更

### `components/auth-modal.tsx`（認証モーダル内）

Magic Link フォームの上に Google ログインボタンを追加する。

```tsx
import { createClient } from "@/lib/supabase/client";

async function handleGoogleLogin() {
  const supabase = createClient();
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
}

// ボタン（フォームの上）
<button
  type="button"
  onClick={handleGoogleLogin}
  className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
>
  {/* Google SVGロゴ — public/google-logo.svg に配置して <img> で参照 */}
  <img alt="" aria-hidden src="/google-logo.svg" className="h-4 w-4" />
  Google でログイン
</button>

// 区切り
<div className="relative my-4 flex items-center">
  <div className="flex-1 border-t border-slate-200" />
  <span className="mx-3 text-xs text-slate-400">または</span>
  <div className="flex-1 border-t border-slate-200" />
</div>

// 既存の Magic Link フォーム（変更なし）
```

Google SVG ロゴは `public/google-logo.svg` に配置すること（公式ブランドガイドライン準拠の素材を使用）。

### `app/auth/callback/route.ts`

既存の Magic Link コールバックルートが OAuth コールバック（`code` パラメータ）も
処理できるか確認し、必要であれば `supabase.auth.exchangeCodeForSession(code)` を追加する。

```ts
// 既存ルートに code 処理がなければ追加
const code = searchParams.get("code");
if (code) {
  await supabase.auth.exchangeCodeForSession(code);
}
```

## 変更ファイル

- `components/auth-modal.tsx`（または認証フォームコンポーネント）
- `app/auth/callback/route.ts`（既存ルートの確認・修正）
- `public/google-logo.svg`（新規追加）

## 受け入れ条件

- [ ] 認証モーダルに「Google でログイン」ボタンが表示される
- [ ] ボタンクリックで Google の認証ページにリダイレクトされる
- [ ] 認証完了後に元のページ（または `/`）へリダイレクトされる
- [ ] 既存の Magic Link ログインが引き続き動作する
- [ ] ログイン後のプロフィール・サブスクリプション状態が正しく反映される
- [ ] `pnpm tsc --noEmit` と `pnpm build` が通る

## 未解決の質問

- `app/auth/callback/route.ts` は既に存在するか（Magic Link 用 — Codex が確認すること）
- Google OAuth の Client ID / Secret は Owner が設定済みか（実装前に確認）
