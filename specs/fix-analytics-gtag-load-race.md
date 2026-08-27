# GA イベントが gtag 読み込み前に発火して消える

## 背景

**本番でカスタムイベントが1件も記録されていない。**（2026-08-27 実測）

`/newsletter/confirmed` を実際のブラウザで開いた前後の GA4 リアルタイム:

| イベント | 訪問前 | 訪問後 |
|---|---:|---:|
| `page_view` | 4 | **5** |
| `session_start` | 1 | **2** |
| `newsletter_confirmed` | 0 | **0** |

**同じ訪問の `page_view` は届いているのに、自前のイベントだけが届かない。**

### 原因

`app/layout.tsx:1,79-81` は GA を `@next/third-parties` 経由で読み込んでいる。

```tsx
import { GoogleAnalytics } from "@next/third-parties/google";
// ...
{process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
  <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
)}
```

`GoogleAnalytics` は内部で `next/script` を **`strategy="afterInteractive"`** で使う。つまり **hydration の後**にスクリプトが読まれる。

一方 `lib/analytics.ts:19-27` の `trackEvent` は、`window.gtag` が未定義なら**黙って return する**。

```ts
export function trackEvent(
  eventName: string,
  params: AnalyticsEventParams = {},
) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return;
  }

  window.gtag("event", eventName, params);
}
```

新規ページ読み込み時の実行順序:

```
1. hydration
2. useEffect が走る          → window.gtag は undefined
3. trackEvent が return       ← ここでイベントが消える
4. GA スクリプト読込・gtag 定義
5. page_view は GA 自身が送る  ← これだけ届く
```

`page_view` だけが記録され、`useEffect` 内で発火する自前イベントが全滅する挙動と完全に一致する。

### 影響範囲は新規イベントより広い

**mount 時に発火するトラッカーはすべて同じ race を踏む。** 以下は今回のニュースレター実装より前から存在する。

| ファイル | イベント | 呼び出し方 |
|---|---|---|
| `components/checkout-success-tracker.tsx:14-16` | `trial_start` | **`window.gtag` を直接呼ぶ** |
| `components/signup-success-tracker.tsx:14-16` | `sign_up` | **`window.gtag` を直接呼ぶ** |
| `components/paywall-view-tracker.tsx:15-22` | `paywall_view` | **`window.gtag` を直接呼ぶ** |
| `components/newsletter-confirmed-tracker.tsx` | `newsletter_confirmed` | `trackEvent` 経由 |

**決済完了（`trial_start`）と新規登録完了（`sign_up`）**という、収益に直結する2イベントが以前から取りこぼされていた可能性が高い。ニュースレターの計測を入れたことでこの既存バグが可視化された。

なお `components/return-visit-tracker.tsx` は `trackReturnVisit` 経由なので `trackEvent` の修正だけで直る。

## スコープ

対象:
- `lib/analytics.ts` の `trackEvent` にキューと flush を実装
- 上記3コンポーネントを `window.gtag` 直呼びから `trackEvent` 経由へ移行
- 対応するテスト

対象外:
- **`app/layout.tsx` の GA 読み込み方法**。`strategy` を変えたり `beforeInteractive` にしたりしない（LCP に影響するため）
- `@next/third-parties` のバージョン変更・置き換え
- イベント名・パラメータの変更（`trial_start` / `sign_up` / `paywall_view` の名前と中身は現状維持）
- クリック等のユーザー操作で発火するイベント（`cta_click` 等）。これらは gtag 読込後に起きるため今回の race を踏まない。ただし `trackEvent` を直すことで結果的に保護される
- GA4 側の設定・コンバージョン登録

## 決定事項（Owner 承認済み・2026-08-27）

**方式 A: gtag が定義されるまでポーリングし、定義された時点でキューを流す。**

`window.dataLayer` に直接 push する方式（B）は採らない。`@next/third-parties` の内部実装への依存を増やさないため。

## データモデル変更

**なし。**

## API サーフェス

**なし。** `trackEvent` と各 `track*` 関数のシグネチャは変更しない。

## 実装方針

### `lib/analytics.ts`

モジュールスコープにキューとタイマーを持つ。

```ts
const GTAG_POLL_INTERVAL_MS = 250;
const GTAG_MAX_WAIT_MS = 10_000;
const MAX_QUEUED_EVENTS = 50;

type QueuedEvent = { eventName: string; params: AnalyticsEventParams };

let queue: QueuedEvent[] = [];
let pollTimer: ReturnType<typeof setInterval> | null = null;
let waitedMs = 0;
```

`trackEvent` の分岐:

1. `typeof window === "undefined"` → 何もしない（SSR）
2. `typeof window.gtag === "function"` → **即座に送る**（現状と同じ挙動）
3. それ以外 → **キューに積み、ポーリングを開始する**

ポーリング:

- `GTAG_POLL_INTERVAL_MS` ごとに `typeof window.gtag === "function"` を確認する
- 真になったら**キューを先頭から順に**送り、キューを空にし、タイマーを止める
- 累計待機が `GTAG_MAX_WAIT_MS` を超えたらタイマーを止め、**キューを破棄する**（無限に溜めない）
- タイマーは**同時に1本だけ**。既に動いていれば新規に張らない

**順序を保つこと。** `newsletter_submit` → `newsletter_result` のように順序に意味があるイベントがある。キューは FIFO で、flush 時も投入順に送る。

**キュー上限。** `MAX_QUEUED_EVENTS` に達したら新しいイベントを**捨てる**（古いものを押し出さない）。順序の意味を壊さないため、先頭を残す。

### 3コンポーネントの移行

`window.gtag` 直呼びをやめ、`lib/analytics.ts` の関数を使う。**イベント名とパラメータは変えない。**

`lib/analytics.ts` に既存の `track*` と同じ形で追加する:

```ts
export function trackTrialStart() {
  trackEvent("trial_start");
}

export function trackSignUp() {
  trackEvent("sign_up");
}

export function trackPaywallView(params: {
  content_type: string;
  match_id?: string;
}) {
  trackEvent("paywall_view", params);
}
```

各コンポーネントは `typeof window.gtag` のチェックを**削除**し（`trackEvent` 側が持つため）、上記関数を呼ぶだけにする。`useSearchParams` による発火条件（`checkout=success` / `signup=success`）と `useEffect` の依存配列は**現状のまま維持する**。

`paywall_view` のパラメータ名は現行の `content_type` / `match_id` をそのまま使う（`components/paywall-view-tracker.tsx:19-21`）。`matchId` が `undefined` のときの挙動も現状どおり。

## UI サーフェス

**なし。** 4コンポーネントとも `return null` のままで、描画は一切変わらない。

## LLM 連携

**なし。**

## 受け入れ条件

1. `window.gtag` が未定義のときに `trackEvent("a")` を呼び、その後 `window.gtag` が定義されると、`a` が送信される。
2. `window.gtag` が未定義のまま `trackEvent("a")` → `trackEvent("b")` → `trackEvent("c")` を呼び、その後 gtag が定義されると、**`a` → `b` → `c` の順**で送信される。
3. `window.gtag` が既に定義されているときの `trackEvent` は、**キューを経由せず同期的に**送信する（現状の挙動を維持）。
4. `window.gtag` が `GTAG_MAX_WAIT_MS` を過ぎても定義されない場合、タイマーが停止し、以降ポーリングしない。溜まったイベントは破棄される。
5. キューに `MAX_QUEUED_EVENTS` 件溜まった状態でさらに `trackEvent` を呼んでも、キューは `MAX_QUEUED_EVENTS` 件を超えない。**先頭（最初に積まれた分）が残る。**
6. `trackEvent` を未定義状態で複数回呼んでも、ポーリングタイマーは**1本しか作られない**。
7. `typeof window === "undefined"`（SSR）で `trackEvent` を呼んでも例外を投げず、キューにも積まない。
8. `CheckoutSuccessTracker` は `checkout=success` のときだけ `trial_start` を送る。それ以外のクエリでは送らない。
9. `SignupSuccessTracker` は `signup=success` のときだけ `sign_up` を送る。
10. `PaywallViewTracker` は `paywall_view` を `{ content_type, match_id }` 付きで送る。
11. 上記8〜10が、**`window.gtag` が未定義の状態でマウントされても**、gtag 定義後に送信される。
12. 上記1〜11をテストで検証する。タイマーは `vi.useFakeTimers()` で制御し、実時間待ちをしない。
13. `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` がすべて通る。
14. 既存のテストが通る。

## やってはいけないこと

- **`app/layout.tsx` の `GoogleAnalytics` の読み込み方を変えないこと。** `strategy="beforeInteractive"` は LCP を悪化させる。今回はクライアント側で待つ方針。
- **`window.dataLayer` に直接 push しないこと**（方式 B は不採用）。
- イベント名を変えないこと。`trial_start` / `sign_up` / `paywall_view` は GA4 側で既に見ている可能性がある。
- キューを `localStorage` / `sessionStorage` に永続化しないこと。ページを離れたら破棄でよい。
- ポーリング間隔を 250ms より短くしないこと。
- `MAX_QUEUED_EVENTS` を超えたときに**古いイベントを捨てない**こと。順序の意味が壊れる。
- `components/return-visit-tracker.tsx` のロジック（localStorage の判定・7日窓・6時間閾値）に手を入れないこと。`trackEvent` の修正だけで直る。
- 発火条件（`checkout=success` / `signup=success`）を変えないこと。

## 未解決の質問

なし。方式は Owner 承認済み（2026-08-27、方式 A）。
