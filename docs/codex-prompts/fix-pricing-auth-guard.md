# fix: pricing 未ログイン時の AuthModal 表示 + モーダル位置ずれ修正

## 問題

### 問題①: ホームへ遷移する
`/pricing` の「Premium を始める」ボタンは `<form action="/api/stripe/checkout" method="POST">` で実装されている。
未ログインで押すと `requireUser()` が `redirect("/")` を呼び、ホームに飛ぶだけでログインを促さない。

### 問題②: モーダルが上すぎて入力欄が見えない
`components/auth-modal.tsx` の overlay が `fixed inset-0 flex items-center justify-center` で実装されている。
モバイルでソフトウェアキーボードが開くと visual viewport が縮小し、モーダルが画面上部に押し上げられて入力欄が隠れる。

## 修正方針

`app/pricing/page.tsx` を Client Component に変換し、ボタンクリック時にセッションを確認する。
- セッションなし → `AuthModal` を表示
- セッションあり → そのまま POST（Stripe Checkout へリダイレクト）

## 修正内容

### `app/pricing/page.tsx`

```tsx
"use client";

import { useState } from "react";
import { AuthModal } from "@/components/auth-modal";
import { getSupabaseBrowserClient } from "@/lib/auth/client";

export default function PricingPage() {
  const [showAuth, setShowAuth] = useState(false);

  async function handlePremiumClick(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setShowAuth(true);
      return;
    }

    (e.currentTarget as HTMLFormElement).submit();
  }

  return (
    <main className="min-h-screen bg-slate-50">
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="mb-10 text-center font-serif text-3xl font-bold tracking-tight text-slate-950">
          プランを選ぶ
        </h1>
        <div className="grid gap-6 sm:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <p className="text-lg font-bold text-slate-950">Free</p>
            <p className="mt-1 text-3xl font-black text-slate-950">¥0</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>試合スコア・順位表</li>
              <li>レビュー冒頭 300 文字</li>
            </ul>
          </section>
          <section className="rounded-xl border-2 border-[var(--color-accent)] bg-white p-6">
            <p className="text-lg font-bold text-slate-950">Premium</p>
            <p className="mt-1 text-3xl font-black text-slate-950">
              ¥980
              <span className="text-base font-normal text-slate-500">/月</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>レビュー・プレビュー全文</li>
              <li>AI チャット</li>
            </ul>
            <form action="/api/stripe/checkout" method="POST" onSubmit={(e) => void handlePremiumClick(e)}>
              <button
                className="mt-6 w-full rounded-xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white hover:opacity-90"
                type="submit"
              >
                Premium を始める
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
```

### `components/auth-modal.tsx`（モーダル位置修正）

overlay の div 構造を変更してスクロール可能にする。
`fixed inset-0 overflow-y-auto` の中に `flex min-h-full items-end justify-center sm:items-center` を入れるパターンで、
キーボード展開時も入力欄がスクロールで到達できる。

```tsx
// overlay（外側）
<div className="fixed inset-0 z-50 overflow-y-auto bg-black/50">
  {/* centering wrapper */}
  <div className="flex min-h-full items-end justify-center p-4 sm:items-center sm:p-0">
    {/* modal panel — 変更なし */}
    <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
      {/* ... 既存の中身そのまま ... */}
    </div>
  </div>
</div>
```

- `items-end` (モバイル): モーダルを画面下部に寄せ、キーボード上に表示
- `sm:items-center` (tablet 以上): 従来どおり中央配置
- `overflow-y-auto` + `min-h-full`: コンテンツが溢れてもスクロール可能

### `supabase/migrations/20260507100000_add_user_profiles.sql`（マイグレーション修正）

`handle_new_user` 関数に `set search_path = public` が抜けており、本番環境で `supabase db push` した際にトリガーが `user_profiles` テーブルを見つけられず "Database error saving new user" が発生する。

```sql
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into user_profiles (id) values (new.id);
  return new;
end;
$$;
```

`security definer` の直後に `set search_path = public` を追加するだけでよい。

## 変更するファイル

- `app/pricing/page.tsx`（Client Component 化・認証チェック追加）
- `components/auth-modal.tsx`（overlay をスクロール可能な構造に変更）
- `supabase/migrations/20260507100000_add_user_profiles.sql`（`handle_new_user` に `set search_path = public` 追加）

## 変更しないファイル

- `app/api/stripe/checkout/route.ts`
- `lib/auth/server.ts`（`requireUser` のリダイレクトはサーバー側ガードとして残す）

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm build` 成功
- 未ログイン状態で「Premium を始める」を押すと AuthModal が表示されること
- ログイン後に「Premium を始める」を押すと `/api/stripe/checkout` に POST されること
- モバイル幅（375px）でモーダルを開いてソフトウェアキーボードを展開しても、入力欄が画面内に収まること（モーダルが下寄せで表示される）
- `supabase/migrations/20260507100000_add_user_profiles.sql` の `handle_new_user` 関数に `set search_path = public` が含まれていること

## ブランチ・PR

- ブランチ: `fix/pricing-auth-guard`
- PR タイトル: `Fix: auth modal on pricing page + modal position on mobile keyboard`
