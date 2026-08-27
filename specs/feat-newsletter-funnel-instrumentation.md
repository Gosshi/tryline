# ニュースレター登録ファネルの計測

## 背景

`email_subscribers` は **1 行（confirmed 1、pending 0）**。フォームは3ページに露出しているのに、28日で161人の新規訪問者から1件しか登録が無い。

しかし **どの段階で落ちているかが分からない。**

```
$ rg -n 'trackNewsletter|newsletter_(submit|subscribe|confirm)' app components lib
（0 件）
```

`lib/analytics.ts` に定義されているイベントは `cta_click` / `favorite_team_added` / `push_permission_granted` / `return_visit` の4つで、ニュースレター関連は**1つも無い**。

現状、次の4つを区別できない。

1. フォームが**見られていない**（スクロール到達していない）
2. 見られているが**入力されない**（文言・価値の問題）
3. 送信されているが**API が失敗している**（429 / 4xx / 5xx / ネットワーク）
4. 送信成功しているが**確認メールのリンクが開かれない**（到達性・迷惑メール）

1〜4 は打ち手がまったく違う。**計測を入れずに文言や配置を変えるのは、変数を1つも固定しないまま実験を始めることになる。**

### なぜ今やるか

2026年11月の日本代表欧州遠征が初のピークシーズンである。**ピーク時に流入が増えてから計測を入れても、その時の離脱点は永久に分からない。** 閑散期の今のうちに計測を入れ、11月のデータで判断できる状態にしておく。

母数が小さいため、**この計測自体が短期の登録数を増やすわけではない。** 目的は次の実験の判断材料を作ることである。

## スコープ

対象:
- `lib/analytics.ts` にニュースレター用のイベント関数を追加
- `components/newsletter-signup.tsx` に表示・送信・結果の計測を追加
- `app/newsletter/confirmed/page.tsx` に確認完了の計測を追加
- 対応するテスト

対象外:
- **フォームの文言・配置・デザインの変更**。今回は計測だけを入れる。1回に複数の変数を動かさない
- 露出箇所の追加・削除（現状の `/`、`/calendar`、`/c/[competition]/[season]` の3箇所を維持）
- 配信処理（`fix-weekly-digest-cron-method.md` の対象）
- `/newsletter/expired`、`/newsletter/invalid-link`、`/newsletter/unsubscribed` の計測
- Web Push / iOS Push の計測

## データモデル変更

**なし。** すべて GA4 のクライアントイベント。

## API サーフェス

**なし。** `/api/newsletter/subscribe` と `/api/newsletter/confirm` のリクエスト・レスポンスは変更しない。

## 計測イベント

すべて既存の `trackEvent`（`lib/analytics.ts:17-25`）経由で送る。`window.gtag` が無ければ何もしない既存のガードをそのまま使う。

| イベント名 | 発火タイミング | パラメータ |
|---|---|---|
| `newsletter_view` | フォームが viewport に入った初回 | `source` |
| `newsletter_submit` | submit ハンドラ開始時（fetch の前） | `source` |
| `newsletter_result` | fetch の結果確定時 | `source`, `status` |
| `newsletter_confirmed` | `/newsletter/confirmed` の表示時 | なし |

### `source` の値

`NewsletterSignupProps` の既存 union をそのまま使う（`components/newsletter-signup.tsx:5-7`）。

```ts
source: "calendar" | "competition" | "home";
```

**新しい値を追加しない。** 3面の比較ができれば十分である。

### `status` の値

`components/newsletter-signup.tsx:22-38` の既存の分岐にそのまま対応させる。分岐そのものは変えない。

| status | 対応する既存分岐 |
|---|---|
| `ok` | `else`（`response.ok` が true） |
| `rate_limited` | `response.status === 429` |
| `error` | `!response.ok`（429 以外） |
| `network_error` | `catch` 節 |

### `lib/analytics.ts` に追加する関数

既存の `trackFavoriteTeamAdded` と同じ形に揃える。

```ts
export type NewsletterSource = "calendar" | "competition" | "home";

export function trackNewsletterView(params: { source: NewsletterSource }) {
  trackEvent("newsletter_view", params);
}

export function trackNewsletterSubmit(params: { source: NewsletterSource }) {
  trackEvent("newsletter_submit", params);
}

export function trackNewsletterResult(params: {
  source: NewsletterSource;
  status: "error" | "network_error" | "ok" | "rate_limited";
}) {
  trackEvent("newsletter_result", params);
}

export function trackNewsletterConfirmed() {
  trackEvent("newsletter_confirmed");
}
```

`NewsletterSource` は `components/newsletter-signup.tsx` 側からも import して `NewsletterSignupProps` に使い、**union を2箇所に書かない**こと。

## UI サーフェス

**見た目は一切変えない。** DOM 構造・クラス・文言・要素の順序を変更しない。

### 表示計測（`newsletter_view`）

`components/newsletter-signup.tsx` の最外側 `<section>` に ref を付け、`IntersectionObserver` で監視する。

- `threshold: 0.5`（フォームの半分以上が見えたら「見られた」とみなす）
- **1コンポーネントにつき1回だけ発火**する。発火後は `observer.disconnect()` を呼ぶ
- `useEffect` の cleanup で必ず `disconnect()` する
- `IntersectionObserver` が未定義の環境（jsdom の一部設定、古いブラウザ）では**何もせず握りつぶす**。フォーム自体は必ず動作すること

リポジトリ内に `IntersectionObserver` の既存実装は無い（`rg -l IntersectionObserver components app` は0件）ため、参考にできる先行実装は無い。新規に書くこと。

### 送信計測（`newsletter_submit` / `newsletter_result`）

`onSubmit`（`components/newsletter-signup.tsx:14-40`）に足す。

- `newsletter_submit` は `setSubmitting(true)` の直後、`fetch` より**前**に発火する
- `newsletter_result` は既存の各分岐の中で、`setMessage(...)` と同じ場所で発火する
- **既存の分岐条件・メッセージ文言・`setEmail("")` のタイミングを変えない**

### 確認完了計測（`newsletter_confirmed`）

`app/newsletter/confirmed/page.tsx` は現在 server component である。**server component のままにし**、イベント発火用の小さな client component を追加して `<section>` 内に置く（描画は何もしない）。

- 新規ファイルは `components/` 配下に置く（例: `components/newsletter-confirmed-tracker.tsx`）
- `"use client"` を付け、`useEffect` で1回だけ `trackNewsletterConfirmed()` を呼び、`return null` する
- ページの見た目・文言・リンク先（`/calendar`）を変更しない

## LLM 連携

**なし。**

## 受け入れ条件

1. フォームが viewport に 50% 以上入ったとき、`newsletter_view` が `{ source }` 付きで**1回だけ**発火する。同じフォームが再度 viewport に入り直しても2回目は発火しない。
2. フォームを submit したとき、`newsletter_submit` が `{ source }` 付きで発火し、その発火が `fetch` 呼び出しより**前**である。
3. API が 200 を返したとき `newsletter_result` が `{ source, status: "ok" }` で発火する。
4. API が 429 を返したとき `{ source, status: "rate_limited" }` で発火する。
5. API が 500 を返したとき `{ source, status: "error" }` で発火する。
6. `fetch` が reject したとき `{ source, status: "network_error" }` で発火する。
7. `/newsletter/confirmed` を表示したとき `newsletter_confirmed` が1回発火する。
8. `window.gtag` が未定義の環境で、上記のいずれも**例外を投げない**。フォームの送信は通常どおり動作する。
9. `IntersectionObserver` が未定義の環境で**例外を投げず**、フォームの送信は通常どおり動作する。
10. 既存の表示文言・DOM 構造・成功/失敗メッセージが変わっていない。`components/newsletter-signup.tsx` の既存テストがあれば修正なしで通る。
11. 上記1〜9を `tests/` 配下のテストで検証する。`window.gtag` はモックする。
12. `pnpm lint`、`pnpm tsc --noEmit`、`pnpm test` がすべて通る。

## やってはいけないこと

- **フォームの文言・配置・デザイン・CTA ラベルを変えないこと。** 計測を入れた直後に見た目も変えると、11月に数字が動いたときどちらの効果か分からなくなる。
- `source` の union に新しい値を足さないこと。
- メールアドレスそのもの、またはハッシュ化したメールアドレスを GA4 に送らないこと。送るのは `source` と `status` だけ。
- `/api/newsletter/subscribe` のレスポンス形状・ステータスコードを変えないこと。
- `app/newsletter/confirmed/page.tsx` を client component に変換しないこと。
- 露出箇所（`/`、`/calendar`、`/c/[competition]/[season]`）を増減させないこと。

## 未解決の質問

なし。
