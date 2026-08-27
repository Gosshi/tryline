`/specs/feat-newsletter-funnel-instrumentation.md` の仕様を実装してください。仕様本文は繰り返しません。着手前に必ず spec を読んでください。

## 状況

ニュースレターの登録は**28日で161人の新規訪問者に対し1件**です。フォームは `/`、`/calendar`、`/c/[competition]/[season]` の3面に露出していますが、**どの段階で落ちているかを示すイベントが1つもありません。**

```
$ rg -n 'trackNewsletter|newsletter_(submit|subscribe|confirm)' app components lib
（0 件）
```

`lib/analytics.ts` にあるのは `cta_click` / `favorite_team_added` / `push_permission_granted` / `return_visit` の4つだけです。

現状、次の4つを区別できません。打ち手はそれぞれ違います。

1. 見られていない（スクロール到達していない）
2. 見られているが入力されない（文言・価値の問題）
3. 送信されているが API が失敗している（429 / 4xx / 5xx / ネットワーク）
4. 送信成功しているが確認メールのリンクが開かれない（到達性・迷惑メール）

## これは計測だけの変更です

**フォームの文言・配置・デザイン・CTA ラベルを1文字も変えないでください。** DOM 構造・クラス・要素の順序も変えないでください。

理由は、11月の日本代表欧州遠征（初のピークシーズン）で数字が動いたとき、計測と見た目のどちらの効果か分からなくなるからです。今回は変数を1つだけ動かします。

## 追加するイベント

4つです。すべて既存の `trackEvent`（`lib/analytics.ts:17-25`）経由で送ります。`window.gtag` が無ければ何もしない既存のガードをそのまま使ってください。

| イベント名 | タイミング | パラメータ |
|---|---|---|
| `newsletter_view` | フォームが viewport に 50% 入った初回 | `source` |
| `newsletter_submit` | submit ハンドラ開始時（`fetch` の**前**） | `source` |
| `newsletter_result` | fetch の結果確定時 | `source`, `status` |
| `newsletter_confirmed` | `/newsletter/confirmed` 表示時 | なし |

`status` は既存の分岐にそのまま対応させます。**分岐条件そのものは変えないでください。**

| status | 既存分岐（`components/newsletter-signup.tsx:22-38`） |
|---|---|
| `ok` | `else`（`response.ok`） |
| `rate_limited` | `response.status === 429` |
| `error` | `!response.ok`（429 以外） |
| `network_error` | `catch` 節 |

`lib/analytics.ts` に追加する関数の具体形は spec に書いてあります。既存の `trackFavoriteTeamAdded` と同じ形に揃えてください。

`NewsletterSource` 型は `lib/analytics.ts` に定義し、`components/newsletter-signup.tsx` の `NewsletterSignupProps` からも import してください。**union を2箇所に書かないこと。**

## 実装上の注意

**表示計測**: 最外側 `<section>` に ref を付け `IntersectionObserver`（`threshold: 0.5`）で監視します。**1コンポーネントにつき1回だけ**発火し、発火後に `observer.disconnect()` を呼びます。`useEffect` の cleanup でも必ず `disconnect()` してください。

リポジトリ内に `IntersectionObserver` の先行実装はありません（`rg -l IntersectionObserver components app` は0件）。新規に書いてください。

**フォールバック**: `IntersectionObserver` が未定義でも、`window.gtag` が未定義でも、**例外を投げず**フォーム送信は通常どおり動くこと。計測がフォームを壊してはいけません。

**確認完了ページ**: `app/newsletter/confirmed/page.tsx` は server component です。**client component に変換しないでください。** `"use client"` の小さなトラッカー（`useEffect` で1回発火して `return null`）を `components/` に新規作成し、`<section>` 内に置いてください。ページの見た目・文言・リンク先（`/calendar`）は変えないこと。

## 送ってはいけないもの

メールアドレスそのもの、またはハッシュ化したメールアドレスを GA4 に送らないでください。送るのは `source` と `status` だけです。

## 触ってはいけないもの

- `/api/newsletter/subscribe` のレスポンス形状・ステータスコード
- 露出箇所（`/`、`/calendar`、`/c/[competition]/[season]` の3面を維持。増減させない）
- `source` の union に新しい値を足さない
- 週次配信処理（別 spec `fix-weekly-digest-cron-method.md` の対象）

## 完了の定義

- spec の受け入れ条件1〜12をすべて満たす
- テストで `window.gtag` をモックし、4イベントの発火・パラメータ・重複しないことを検証する
- `IntersectionObserver` 未定義時と `gtag` 未定義時に例外が出ないことをテストする
- `pnpm lint` / `pnpm tsc --noEmit` / `pnpm test` がすべて通る

## PR に書いてほしいこと

**表示文言と DOM が変わっていないこと**を差分で示してください。`components/newsletter-signup.tsx` の JSX に対する変更が ref の追加のみであることが分かるようにしてください。
