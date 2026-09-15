# 集客・継続利用・課金ファネルを計測可能にする

## 背景

大会ページからの検索流入はあるが、料金 CTA を押した人が実際に Stripe Checkout を開始したかは分からない。既存イベントは `cta_click`（クリック意図）と `trial_start`（Checkout 成功後の 7 日間トライアル開始）だけである。

`trial_start` を実売上として扱わない。実売上の真値は Stripe / Supabase とし、`purchase` のサーバーサイド計測は別仕様で扱う。

記事の `paywall_view` は PR #806 で有料境界への到達時に送る実装が入っている。GA4 の `competition_slug`、`season`、`is_sample` は Owner が 2026-09-15 にイベントスコープで登録済みである。

## スコープ

対象:

- 認証済みユーザーが Stripe Checkout POST を開始する直前に `begin_checkout` を送る
- 既存の GA4 / GSC / Bing 読み取り手段を使う週次レポート手順を追加する
- テスト

対象外:

- 料金、トライアル、Stripe Session、Webhook、購入・解約フローの変更
- `trial_start`、`sign_up`、既存 `cta_click`、`paywall_view` の変更
- `purchase` の送信、GA4 Measurement Protocol、GTM、外部 API、環境変数、依存追加、定期ジョブ、外部送信
- 料金 UI、CTA 文言・位置・デザインの変更
- GSC / Bing raw 出力や認証情報のコミット
- `match_id` のカスタムディメンション登録（高カーディナリティのため）

## データモデル変更 / API サーフェス

なし。`POST /api/stripe/checkout` のリクエスト、レスポンス、認証、Stripe Session は変更しない。

## イベント仕様

`lib/analytics.ts` に `trackBeginCheckout(params: CtaClickParams)` を追加する。実装は `trackEvent("begin_checkout", params)` のみとする。

`PricingForm` の順序:

1. 既存どおり `cta_click` を送る
2. 未ログインなら認証モーダルを表示して終了する。この経路では `begin_checkout` を送らない
3. ログイン済みなら `form.submit()` の直前に 1 回だけ `trackBeginCheckout(analytics)` を送る
4. 既存どおり `form.submit()` で `/api/stripe/checkout` へ POST する

2 つの料金 CTA は既存 `analytics` prop をそのまま使う。

| CTA | `cta_id` | `cta_location` | `destination` |
|---|---|---|---|
| 料金ヒーロー | `pricing_hero_checkout` | `pricing_hero` | `checkout` |
| サンプル下 | `pricing_sample_section_checkout` | `pricing_sample_section` | `checkout` |

`analytics` が未指定の再利用ケースでは、既存 submit を維持し `begin_checkout` は送らない。GA4 予約流入パラメータ（`source`、`medium`、`campaign`、`term`、`content`）は送らない。

イベントの意味は固定する。

| イベント | 意味 |
|---|---|
| `cta_click` | CTA を押した意図。未ログインの認証開始を含む |
| `begin_checkout` | 認証済みで Checkout POST を開始する直前 |
| `trial_start` | Checkout 成功後、無料トライアルが始まった時点 |
| `purchase` | 実売上の代用にしない。Stripe / Supabase が正 |

## 週次レポート

新規 `docs/runbooks/weekly-growth-report.md` を追加する。毎週月曜 JST に、直近 7 日と前 7 日を同じ形式で比較する。自動送信・raw 出力の保存はしない。

- GA4: sessions、activeUsers、engagedSessions、engagementRate、averageSessionDuration、流入元、着地ページ、デバイス
- GA4: `cta_click`、`begin_checkout`、`trial_start`、`sign_up`、`newsletter_confirmed`、`paywall_view` の eventCount と activeUsers
- GA4: `cta_id`、`cta_location`、`paywall_location`、`viewer_type`、`is_sample`、`competition_slug`、`season` で必要時に分解
- GSC: 既存 `tools/gsc-pull.ts --range 28d --dims page` による clicks / impressions / CTR / position
- Bing: 既存 `tools/bing-pull.ts` の read-only `traffic` / `query` / `page`

検索は絶対クリック数より CTR を中心に評価し、試合日程・大会開幕による変動と UI 施策を混同しない。カスタムディメンションは登録日以後のイベントだけを評価する。

## UI / LLM

UI の差分なし。LLM 呼び出しなし。

## 受け入れ条件

1. ログイン済みの料金 CTA 送信で、`form.submit()` 直前に `begin_checkout` が 1 回送られる
2. `begin_checkout` は元 CTA と同じ `cta_id`、`cta_location`、`destination`、`label` を含む
3. 未ログインでは `cta_click` は維持され、`begin_checkout` は送られない
4. `analytics` 未指定でも submit は維持され、`begin_checkout` は送られない
5. `trial_start` の条件・payload と `purchase` の送信に差分がない
6. `begin_checkout` を含む全 analytics payload に GA4 の予約流入キーがない
7. 前後比較・CTR の解釈を含む週次レポート手順がある
8. raw 出力・認証情報をリポジトリに書き込まない
9. `pnpm lint`、`pnpm typecheck`、関連テスト、`pnpm build` が通る

## 未解決の質問

なし。実売上の `purchase` 計測は Stripe / Supabase の権威ある記録との設計を要するため、本仕様に含めない。
