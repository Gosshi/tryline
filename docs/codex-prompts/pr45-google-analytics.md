# PR45: Google Analytics 4 導入

## 背景

収益化の転換率を計測するために GA4 を導入する。
測定 ID は `G-NM7DP5CFL0`。

Vercel の Environment Variables にはすでに以下を設定済み:
```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-NM7DP5CFL0
```

## スコープ

対象:
- `package.json`（`@next/third-parties` を追加）
- `app/layout.tsx`（GA4 スクリプトを追加）
- `app/page.tsx`（購入コンバージョンイベントを発火）
- `components/checkout-success-tracker.tsx`（新規作成）
- `.env.example`

対象外:
- カスタムイベントの詳細設計（基本計測のみ）
- Cookie 同意バナー

## 変更詳細

### 1. パッケージ追加

```bash
pnpm add @next/third-parties
```

### 2. `app/layout.tsx` に GA4 スクリプトを追加

```typescript
import { GoogleAnalytics } from "@next/third-parties/google";

// RootLayout の return 内、</body> の直前に追加
export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body className={...}>
        <SiteHeader />
        {children}
        <SiteFooter />
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
        )}
      </body>
    </html>
  );
}
```

`GoogleAnalytics` コンポーネントは Next.js が最適なタイミングでスクリプトをロードするため、
`next/script` の手動実装より優先する。

### 3. `components/checkout-success-tracker.tsx` を新規作成

Stripe Checkout 完了後、`/?checkout=success` にリダイレクトされる。
このクエリパラメータを検知して GA4 に `purchase` イベントを送信する。

```typescript
"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function CheckoutSuccessTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("checkout") !== "success") return;

    if (typeof window.gtag === "function") {
      window.gtag("event", "purchase", {
        currency: "JPY",
        value: 980,
      });
    }
  }, [searchParams]);

  return null;
}
```

`window.gtag` の型エラーが出る場合は `global.d.ts`（なければ新規作成）に追加する:

```typescript
declare function gtag(...args: unknown[]): void;

interface Window {
  gtag: typeof gtag;
}
```

### 4. `app/page.tsx` に `CheckoutSuccessTracker` を配置

```typescript
import { Suspense } from "react";
import { CheckoutSuccessTracker } from "@/components/checkout-success-tracker";

// ページコンポーネントの return 内に追加
<Suspense>
  <CheckoutSuccessTracker />
</Suspense>
```

### 5. `.env.example` に追加

```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

## 受け入れ条件

- `pnpm build` でエラーなし
- `https://www.trylinerugby.com` を開いて GA4 のリアルタイムレポートにアクセスが表示される
- Stripe 購入完了後に GA4 リアルタイムレポートで `purchase` イベントが記録される
- 環境変数が未設定の場合（ローカル開発等）はスクリプトがロードされない

## 参考ファイル

- `app/api/stripe/checkout/route.ts` — `success_url: \`${siteUrl}/?checkout=success\`` を確認済み
- `app/layout.tsx` — GA スクリプトの追加先
- `app/page.tsx` — `CheckoutSuccessTracker` の配置先
