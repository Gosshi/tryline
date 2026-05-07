# feat: ユーザー認証（Magic Link）+ Stripe サブスクリプション

## 目的

Supabase Auth による Magic Link 認証を導入し、
¥980/月の Premium プランを Stripe Checkout で購読できるようにする。
AI チャット（pr16）の Premium ガードもこの PR で追加する。

**必ず `design.md` を最初に読んでから実装すること。**

## 参照すべきファイル

- `specs/p2-auth.md` — 認証仕様書（権威文書）
- `specs/p2-stripe-subscription.md` — Stripe 仕様書（権威文書）
- `components/site-header.tsx` — UserMenu を追加する対象
- `components/match-chat.tsx` — Premium ガードを追加する対象（pr16 で作成）

## 新規環境変数

`.env.local` に追記（Owner が手動設定）:

```
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_PREMIUM_PRICE_ID=price_xxx
NEXT_PUBLIC_SITE_URL=https://tryline-six.vercel.app
```

## Supabase マイグレーション

### `supabase/migrations/<timestamp>_add_user_profiles.sql`

```sql
create table if not exists user_profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  display_name           text,
  subscription_status    text not null default 'free'
                           check (subscription_status in ('free', 'premium', 'cancelled')),
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table user_profiles enable row level security;
create policy "own profile" on user_profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into user_profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
```

## 実装

### 1. `lib/auth/server.ts` を新規作成

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export function getSupabaseServerClientWithAuth() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (values) => {
          values.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );
}

export async function getUser() {
  const supabase = getSupabaseServerClientWithAuth();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/");
  return user;
}

export async function getUserProfile(userId: string) {
  const supabase = getSupabaseServerClientWithAuth();
  const { data } = await supabase
    .from("user_profiles")
    .select("subscription_status, stripe_customer_id")
    .eq("id", userId)
    .single();
  return data;
}

export async function isPremium(userId: string): Promise<boolean> {
  const profile = await getUserProfile(userId);
  return profile?.subscription_status === "premium";
}
```

---

### 2. `lib/auth/client.ts` を新規作成

```ts
import { createBrowserClient } from "@supabase/ssr";

export function getSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

---

### 3. `app/auth/callback/route.ts` を新規作成

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (values) => {
            values.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          },
        },
      },
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/?auth_error=1`);
}
```

---

### 4. `components/auth-modal.tsx` を新規作成

```tsx
"use client";

import { useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/auth/client";

type Props = { onClose: () => void };

export function AuthModal({ onClose }: Props) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");

  async function submit() {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setState(error ? "error" : "sent");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <h2 className="mb-4 text-lg font-black text-slate-950">ログイン</h2>
        {state === "sent" ? (
          <p className="text-sm text-slate-600">
            メールを送りました。リンクをクリックしてログインしてください。
          </p>
        ) : (
          <>
            {state === "error" && (
              <p className="mb-3 text-sm text-red-600">エラーが発生しました。</p>
            )}
            <input
              className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="メールアドレス"
              type="email"
              value={email}
            />
            <button
              className="w-full rounded-lg bg-[var(--color-accent)] py-2 text-sm font-semibold text-white hover:opacity-90"
              onClick={() => void submit()}
              type="button"
            >
              Magic Link を送る
            </button>
          </>
        )}
        <button
          className="mt-4 w-full text-center text-xs text-slate-400 hover:text-slate-600"
          onClick={onClose}
          type="button"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
```

---

### 5. `components/user-menu.tsx` を新規作成

```tsx
"use client";

import { useState } from "react";

import type { User } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "@/lib/auth/client";

import { AuthModal } from "./auth-modal";

type Props = { user: User | null; isPremium: boolean };

export function UserMenu({ user, isPremium }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [open, setOpen] = useState(false);

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    location.reload();
  }

  if (!user) {
    return (
      <>
        <button
          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300"
          onClick={() => setShowModal(true)}
          type="button"
        >
          ログイン
        </button>
        {showModal && <AuthModal onClose={() => setShowModal(false)} />}
      </>
    );
  }

  return (
    <div className="relative">
      <button
        className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        {isPremium && (
          <span className="rounded-full bg-[var(--color-accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">
            Premium
          </span>
        )}
        {user.email?.split("@")[0]}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-200 bg-white shadow-lg">
          {!isPremium && (
            <a
              className="block px-4 py-2.5 text-xs font-semibold text-[var(--color-accent)] hover:bg-slate-50"
              href="/pricing"
            >
              Premium にアップグレード
            </a>
          )}
          {isPremium && (
            <a
              className="block px-4 py-2.5 text-xs text-slate-600 hover:bg-slate-50"
              href="/api/stripe/portal"
            >
              プランを管理する
            </a>
          )}
          <button
            className="block w-full px-4 py-2.5 text-left text-xs text-slate-600 hover:bg-slate-50"
            onClick={() => void signOut()}
            type="button"
          >
            サインアウト
          </button>
        </div>
      )}
    </div>
  );
}
```

---

### 6. `components/paywall.tsx` を新規作成

```tsx
type Props = { isPremium: boolean; children: React.ReactNode };

export function Paywall({ isPremium, children }: Props) {
  if (isPremium) return <>{children}</>;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-sm">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/60 backdrop-blur-sm">
        <p className="text-sm font-semibold text-slate-800">
          続きは Premium でご覧いただけます
        </p>
        <a
          className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          href="/pricing"
        >
          Premium を始める — ¥980/月
        </a>
      </div>
    </div>
  );
}
```

---

### 7. Stripe API ルートを新規作成

#### `app/api/stripe/checkout/route.ts`

```ts
import Stripe from "stripe";

import { requireUser } from "@/lib/auth/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  const user = await requireUser();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: process.env.STRIPE_PREMIUM_PRICE_ID!, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_SITE_URL}/?checkout=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL}/pricing`,
    customer_email: user.email,
    metadata: { userId: user.id },
    locale: "ja",
  });

  return Response.json({ url: session.url });
}
```

#### `app/api/stripe/portal/route.ts`

```ts
import Stripe from "stripe";

import { getUserProfile, requireUser } from "@/lib/auth/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  const user = await requireUser();
  const profile = await getUserProfile(user.id);
  if (!profile?.stripe_customer_id) {
    return Response.json({ error: "no_customer" }, { status: 400 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: process.env.NEXT_PUBLIC_SITE_URL!,
  });

  return Response.json({ url: session.url });
}
```

#### `app/api/stripe/webhook/route.ts`

```ts
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const sub = event.data.object as Stripe.Subscription;
  const userId = sub.metadata?.userId;
  if (!userId) return new Response("ok");

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    const status = sub.status === "active" ? "premium" : "free";
    await supabase
      .from("user_profiles")
      .update({
        subscription_status: status,
        stripe_customer_id: sub.customer as string,
        stripe_subscription_id: sub.id,
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
  }

  if (event.type === "customer.subscription.deleted") {
    await supabase
      .from("user_profiles")
      .update({ subscription_status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", userId);
  }

  return new Response("ok");
}
```

---

### 8. `app/pricing/page.tsx` を新規作成

```tsx
export default function PricingPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <h1 className="mb-10 text-center text-3xl font-black tracking-tight text-slate-950">
          プランを選ぶ
        </h1>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <p className="text-lg font-bold text-slate-950">Free</p>
            <p className="mt-1 text-3xl font-black text-slate-950">¥0</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>試合スコア・順位表</li>
              <li>recap 冒頭 300 文字</li>
            </ul>
          </div>
          <div className="rounded-2xl border-2 border-[var(--color-accent)] bg-white p-6">
            <p className="text-lg font-bold text-slate-950">Premium</p>
            <p className="mt-1 text-3xl font-black text-slate-950">
              ¥980
              <span className="text-base font-normal text-slate-500">/月</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>recap・preview 全文</li>
              <li>AI チャット</li>
            </ul>
            <form action="/api/stripe/checkout" method="POST">
              <button
                className="mt-6 w-full rounded-xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-white hover:opacity-90"
                type="submit"
              >
                Premium を始める
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
```

---

### 9. `components/site-header.tsx` に UserMenu を統合

`site-header.tsx` をサーバーコンポーネントに変更し、
`getUser()` / `isPremium()` を呼び出して `UserMenu` に渡す。

```tsx
import { getUser, isPremium } from "@/lib/auth/server";
import { UserMenu } from "./user-menu";

// SiteHeader を async に変更
export default async function SiteHeader() {
  const user = await getUser();
  const premium = user ? await isPremium(user.id) : false;

  return (
    <header ...>
      {/* 既存ナビゲーション */}
      <nav ...>
        {/* 既存リンク群 */}
        <UserMenu isPremium={premium} user={user} />
      </nav>
    </header>
  );
}
```

---

## 追加パッケージ

```bash
pnpm add stripe @supabase/ssr
```

## 変更・作成するファイル

- `supabase/migrations/<timestamp>_add_user_profiles.sql`（新規作成）
- `lib/auth/server.ts`（新規作成）
- `lib/auth/client.ts`（新規作成）
- `app/auth/callback/route.ts`（新規作成）
- `components/auth-modal.tsx`（新規作成）
- `components/user-menu.tsx`（新規作成）
- `components/paywall.tsx`（新規作成）
- `app/api/stripe/checkout/route.ts`（新規作成）
- `app/api/stripe/portal/route.ts`（新規作成）
- `app/api/stripe/webhook/route.ts`（新規作成）
- `app/pricing/page.tsx`（新規作成）
- `components/site-header.tsx`（UserMenu 追加・async 化）

## 変更しないこと

- `lib/db/queries/matches.ts` の既存関数
- `app/globals.css`・`tailwind.config.ts`
- 既存ページのコンテンツ表示ロジック

## 完了条件

- メールアドレスを入力すると Magic Link が届くこと
- リンククリックでログイン状態になり元のページに戻ること
- サインアップ時に `user_profiles` が自動作成されること
- Stripe Checkout 完了後に `subscription_status = 'premium'` になること
- webhook 署名検証失敗で 400 が返ること
- Customer Portal から解約できること
- `pnpm tsc --noEmit` パス
- `pnpm build` 成功

## ブランチ・PR

- ブランチ: `feat/auth-stripe`
- PR タイトル: `Feat: add Supabase magic link auth and Stripe Premium subscription`
