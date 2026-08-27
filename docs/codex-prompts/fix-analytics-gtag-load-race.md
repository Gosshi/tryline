`/specs/fix-analytics-gtag-load-race.md` の仕様を実装してください。仕様本文は繰り返しません。着手前に必ず spec を読んでください。

## 状況

**本番でカスタム GA イベントが1件も記録されていません。**（2026-08-27 実測）

実ブラウザで `/newsletter/confirmed` を開いた前後の GA4 リアルタイム:

| イベント | 訪問前 | 訪問後 |
|---|---:|---:|
| `page_view` | 4 | **5** |
| `newsletter_confirmed` | 0 | **0** |

同じ訪問の `page_view` は届いているのに、自前イベントだけ消えています。

原因は読み込み順です。`app/layout.tsx:80` の `GoogleAnalytics`（`@next/third-parties`）は **`strategy="afterInteractive"`**、つまり hydration の後にスクリプトを読みます。一方 `lib/analytics.ts:23-25` は `window.gtag` が未定義なら**黙って return** します。

```
1. hydration
2. useEffect 実行  → window.gtag は undefined
3. trackEvent が return   ← 消える
4. GA スクリプト読込
```

## これは新機能のバグではありません

`window.gtag` を**直接呼んでいる**既存トラッカーが3つあり、同じ race を踏みます。

| ファイル | イベント |
|---|---|
| `components/checkout-success-tracker.tsx:14-16` | **`trial_start`（決済完了）** |
| `components/signup-success-tracker.tsx:14-16` | **`sign_up`（新規登録）** |
| `components/paywall-view-tracker.tsx:15-22` | `paywall_view` |

**収益に直結する2イベントが以前から取りこぼされていた可能性が高い**ということです。今回の修正はこの3つも対象に含みます。

（`components/return-visit-tracker.tsx` は `trackReturnVisit` 経由なので `trackEvent` の修正だけで直ります。触らないでください。）

## 直すのは2点です

**1. `trackEvent` にキューと flush を入れる（方式 A・Owner 承認済み）**

- gtag が既にあれば**今までどおり同期送信**
- 無ければキューに積み、**250ms ごとにポーリング**
- 定義されたら**FIFO 順に**流してタイマー停止
- **10秒**で諦めてタイマー停止・キュー破棄
- タイマーは**同時に1本だけ**
- キュー上限**50件**。超えたら**新しい方を捨てる**（先頭を残す。順序の意味を壊さないため）

定数名と具体形は spec の「実装方針」にあります。そのまま使って構いません。

**`window.dataLayer` への直接 push はしないでください**（方式 B は不採用）。`@next/third-parties` の内部実装への依存を増やさないためです。

**2. 3コンポーネントを `trackEvent` 経由に移行する**

`lib/analytics.ts` に `trackTrialStart` / `trackSignUp` / `trackPaywallView` を既存の `track*` と同じ形で足し、各コンポーネントから `typeof window.gtag` のチェックを削除して呼ぶだけにします。

**イベント名とパラメータは1文字も変えないでください。** `trial_start` / `sign_up` / `paywall_view`、`content_type` / `match_id` はそのままです。GA4 側で既に見ている可能性があります。

**発火条件も変えないでください。** `searchParams.get("checkout") !== "success"` などの early return と `useEffect` の依存配列は現状維持です。

## 触ってはいけないもの

- **`app/layout.tsx` の GA 読み込み方**。`strategy="beforeInteractive"` は LCP を悪化させます。クライアント側で待つのが今回の方針です
- `@next/third-parties` のバージョン
- `components/return-visit-tracker.tsx` のロジック（localStorage 判定・7日窓・6時間閾値）
- キューの永続化（`localStorage` / `sessionStorage` に入れない。ページを離れたら破棄でよい）

## 完了の定義

- spec の受け入れ条件1〜14をすべて満たす
- **テストは `vi.useFakeTimers()` でタイマーを制御し、実時間を待たない**
- 順序（条件2）と上限時の挙動（条件5: 先頭が残る）は必ずテストする
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` がすべて通る

## PR に書いてほしいこと

**gtag 未定義の状態でマウントしたときに `trial_start` と `sign_up` が失われない**ことを、どのテストが保証しているかケース名で示してください。この2つが今回の修正の主目的です。
