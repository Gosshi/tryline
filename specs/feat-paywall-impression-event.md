# ペイウォール表示イベント（paywall_view）の計測

## 背景

`docs/measurement-plan-2026-06.md`（GAP-2）で、CTR系イベント（`*_pricing` の `cta_click`）はあるのに、その**分母**となる「ペイウォールが実際に表示された回数」を計測するイベントが存在しないと指摘されている。同ドキュメントの改善案テーブルに `specs/feat-paywall-impression-event.md` という本ファイル名がそのまま記載されており、本 spec はその実装にあたる。

現状 `cta_click`（`cta_id: "paywall_pricing"`）の分母が「ページビュー」しかなく、「ペイウォールを見た人のうち何%が課金導線をクリックしたか」というCTRが計算できない。

## スコープ

対象:
- `components/paywall.tsx` がロック状態で描画されたときに、GA4 へ `paywall_view` イベントを1回発火する
- `components/match-chat.tsx` のチャットロック状態（Premium 限定）でも同様に発火する

対象外:
- `paywall_view` を使った GA4 側の探索レポート作成（Owner が GA4 UI で実施）
- ペイウォール以外のロック要素（存在すれば別途検討）
- `cta_click` イベント自体の変更（`paywall_pricing` 等は現状維持）

## データモデル変更

なし。

## API サーフェス

なし（クライアントサイドの GA4 イベント発火のみ）。

## UI サーフェス

`components/paywall.tsx` はサーバーコンポーネントで、`isPremium` が false のときロック UI を描画する。GA4 イベント発火にはクライアントサイドの `useEffect` が必要なため、`components/checkout-success-tracker.tsx` と同じパターンで小さなクライアントコンポーネントを新設する。

### 新規: `components/paywall-view-tracker.tsx`

```tsx
"use client";

import { useEffect } from "react";

type PaywallViewTrackerProps = {
  contentType: string;
  matchId?: string;
};

export function PaywallViewTracker({ contentType, matchId }: PaywallViewTrackerProps) {
  useEffect(() => {
    if (typeof window.gtag === "function") {
      window.gtag("event", "paywall_view", {
        content_type: contentType,
        match_id: matchId,
      });
    }
  }, [contentType, matchId]);

  return null;
}
```

### `components/paywall.tsx` への組み込み

`isPremium` が false のロック分岐内にのみ `<PaywallViewTracker />` を配置する（Premium ユーザー閲覧時は発火しない）:

```tsx
if (isPremium) {
  return <>{children}</>;
}

return (
  <div className="relative overflow-hidden rounded-xl">
    <PaywallViewTracker contentType={contentType} matchId={matchId} />
    {/* 既存のロックUI */}
  </div>
);
```

`Paywall` の props に `contentType`（呼び出し元が recap/preview 等を渡す）と `matchId`（任意）を追加する。既存の呼び出し元（`components/match-content.tsx` 等）を grep で洗い出し、渡せる値がある箇所は渡す。

### `components/match-chat.tsx` への組み込み

チャットのロック状態を判定している箇所（`isPremium` 相当の分岐）に同様の `<PaywallViewTracker contentType="chat" matchId={...} />` を追加する。

## LLM 連携

なし。

## 受け入れ条件

1. `isPremium=false` で `Paywall` コンポーネントがロック状態で描画されたとき、`window.gtag` が `paywall_view` イベントで1回呼ばれる（`content_type` パラメータ付き）
2. `isPremium=true` のとき `paywall_view` は発火しない
3. `match-chat.tsx` のロック状態でも同様に `content_type: "chat"` で発火する
4. 既存の `cta_click`（`paywall_pricing` 等）の挙動・パラメータに変更がない
5. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
6. `paywall.tsx` / `match-chat.tsx` の既存テスト（あれば）が壊れない。無ければ `PaywallViewTracker` の発火条件についてユニットテストを1件追加する

## 未解決の質問

- 同一ページ内で `Paywall` が複数回描画されるケース（例: 1ページに複数のロックブロック）がある場合、各ブロックごとに1回発火してよいか、ページ全体で重複排除すべきか。既存の `CheckoutSuccessTracker` はページ単位1回発火のパターンだが、本 spec ではコンポーネント単位の素直な発火を採用した。要件が変わる場合は Owner 判断
