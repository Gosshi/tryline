# サインアップ・トライアル開始イベント（sign_up / trial_start）の計測

## 背景

`docs/measurement-plan-2026-06.md`（GAP-4）で、ファネルの先行指標である「無料トライアル登録率」に対応する GA イベントが無いと指摘されている（`sign_up` / `trial_start` 不在）。同ドキュメントの改善案テーブルに `specs/feat-signup-trial-events.md` という本ファイル名がそのまま記載されており、本 spec はその実装にあたる。

現状 GA4 で追える完了イベントは `purchase`（`?checkout=success` 着地時）のみで、その手前の「アカウント作成」「7日間無料トライアル開始（Stripe Checkout 完了）」という2つの先行ステップが見えない。`purchase` が0件でも、`sign_up`/`trial_start` が伸びていれば「オファーは刺さっているが最終課金導線に問題がある」等の切り分けができるようになる。

## スコープ

対象:
- `app/auth/callback/route.ts`（Supabase Auth のコールバック）で、新規アカウント作成を検知し、`sign_up` イベント計測用のクエリパラメータを付けてリダイレクトする
- クライアント側で `sign_up` イベントを発火する `SignupSuccessTracker` コンポーネントを新設し、ホーム等の共通レイアウトに設置する
- `app/api/stripe/checkout/route.ts` の Stripe Checkout は既に `trial_period_days: 7` で7日間無料トライアルを開始する構成になっている。**トライアル開始＝Checkout 完了と同義**のため、既存の `?checkout=success` 着地と同じタイミングで `trial_start` イベントも発火する（`CheckoutSuccessTracker` を拡張）

対象外:
- `purchase` イベント自体の変更（GAP-3 のサーバーサイド補完は別途・本 spec は対象外）
- Stripe 側のトライアル期間設定変更（`trial_period_days: 7` は現状維持）
- GA4 側のファネル探索レポート作成（Owner が GA4 UI で実施）

## データモデル変更

なし。

## API サーフェス

### `app/auth/callback/route.ts` の変更

`supabase.auth.exchangeCodeForSession(code)` の戻り値 `data.user` の `created_at` と現在時刻の差が短い（例: 60秒以内）場合を「新規サインアップ」とみなす。厳密な新規/既存判定用フラグが Supabase Auth のレスポンスに無いため、この時刻差ヒューリスティックを使う（Codex の裁量で閾値調整可）。

```ts
const { data, error } = await supabase.auth.exchangeCodeForSession(code);

if (!error && data.user) {
  const isNewSignup =
    Date.now() - new Date(data.user.created_at).getTime() < 60_000;
  const redirectUrl = new URL(`${origin}${next}`);

  if (isNewSignup) {
    redirectUrl.searchParams.set("signup", "success");
  }

  return NextResponse.redirect(redirectUrl.toString());
}
```

## UI サーフェス

### 新規: `components/signup-success-tracker.tsx`

`components/checkout-success-tracker.tsx` と同一パターン:

```tsx
"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function SignupSuccessTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("signup") !== "success") {
      return;
    }

    if (typeof window.gtag === "function") {
      window.gtag("event", "sign_up");
    }
  }, [searchParams]);

  return null;
}
```

`app/page.tsx`（ホーム）の `<Suspense><CheckoutSuccessTracker /></Suspense>` の隣に、同様に `<Suspense><SignupSuccessTracker /></Suspense>` を設置する（`?next=` のリダイレクト先がホームであるケースが最も多いため。他のリダイレクト先で発火しなくても致命的ではない）。

### `components/checkout-success-tracker.tsx` の拡張

`purchase` に加えて `trial_start` も同時発火する:

```tsx
useEffect(() => {
  if (searchParams.get("checkout") !== "success") {
    return;
  }

  if (typeof window.gtag === "function") {
    window.gtag("event", "purchase", {
      currency: "JPY",
      value: 980,
    });
    window.gtag("event", "trial_start");
  }
}, [searchParams]);
```

## LLM 連携

なし。

## 受け入れ条件

1. `app/auth/callback/route.ts` で、`data.user.created_at` が現在時刻から60秒以内の新規ユーザーがログイン完了したとき、リダイレクト先 URL に `signup=success` クエリが付与される
2. 60秒より前に作成された既存ユーザーの再ログインでは `signup=success` が付与されない
3. `signup=success` を含むページを開いたとき、`window.gtag` が `sign_up` イベントで1回呼ばれる
4. `?checkout=success` を含むページを開いたとき、`window.gtag` が `purchase` と `trial_start` の両方のイベントで呼ばれる
5. 既存の `purchase` イベントのパラメータ（`currency: "JPY"`, `value: 980`）に変更がない
6. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
7. `checkout-success-tracker.tsx` の既存テストがあれば `trial_start` 発火を含めて更新する。`signup-success-tracker.tsx` にも同様のテストを新規追加する

## 未解決の質問

- 新規サインアップ判定の60秒閾値は暫定。Supabase Auth のレスポンスに、より確実な「新規作成フラグ」（例: `identities` 配列の作成時刻比較等）があれば、Codex の実装時にそちらを優先してよい
- OAuth（Google 等）以外のログイン手段（マジックリンク等）でも `app/auth/callback/route.ts` を経由するか要確認。経由しない認証経路がある場合は `sign_up` が計測漏れになるため、実装時に `components/auth-modal.tsx` の認証フロー分岐を確認し、必要なら Owner に報告する
