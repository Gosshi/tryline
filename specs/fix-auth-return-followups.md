# ログイン後の戻り先と計測の取りこぼしを直す（T1 の追加修正）

計画: `docs/dev-plan-2026-10-12.md` T1 の追加修正。前提の仕様: `specs/fix-auth-purchase-intent-return.md`（PR #933、2026-10-11 マージ済み）。

## 背景

#933 のマージ後、2026-10-11 に本番で確認した（Supabase の auth_logs・GA4 リアルタイム・ブラウザでの実操作）。購入の再開そのものは、メールのリンクと Google の両方で Checkout まで進んだ。ただし次の4つが見つかった。

1. **ログインに成功しても `/?auth_error=1` に戻る（#933 で入った不具合）。** モーダルは「今いるページに戻る」ので、`/?auth_error=1` の画面からログインし直すと `next=/?auth_error=1` になる。auth_logs では 22:06:48 に `/token` が 200（成功）なのに、戻り先が `/?auth_error=1` だった。同じ形で `signup=success` も持ち越され、`sign_up` が二重に送られうる。
2. **購入の再開で `begin_checkout` が GA4 に届かない。** `app/pricing/pricing-auth-resume.tsx` は `trackBeginCheckout(...)` の直後に `form.submit()` する。`lib/analytics.ts` の `trackEvent` は gtag が未読込だとキューに積むだけなので、そのままページを離れるとイベントが消える。ケース1の直後、GA4 リアルタイム（直近30分）で `cta_click` は届いていたが `begin_checkout` は0件だった。
3. **新規登録の `sign_up` が料金ページでは送られない（#933 で入った不具合）。** `components/signup-success-tracker.tsx` はホーム（`app/page.tsx:279`）にしか置かれていない。#933 の前はログイン後に必ず `/` に戻っていたので届いていた。今は `/pricing?resume=checkout&signup=success` に戻るので、料金ページから登録した人の `sign_up` が送られない。さらに、再開はすぐ Checkout へ移動するため、2と同じ理由で消える。
4. **ログインに失敗しても、何の説明もない。** callback は失敗すると `/?auth_error=1` に送る（`app/auth/callback/route.ts:57`）。しかし `auth_error` を読むコードはどこにもない（`grep -rnE "auth_error" app components lib` の該当は route.ts の1行だけ）。ホームに戻されるので、購入の流れからも外れる。メールのリンクは PKCE のため、送信したのと別のブラウザで開くと必ず失敗する（2026-10-11、シークレットウィンドウで再現。auth_logs では `/verify` は成功したが `/token` が無い）。

## スコープ

対象:
- callback：戻り先から `auth_error` と `signup` を取り除く。失敗したときも、検証済みの戻り先（`resume` を除く）に `auth_error=1` を付けて返す
- ログイン失敗の案内（全ページ共通）
- `sign_up` の送信を全ページで行う
- 購入の再開時に、`begin_checkout`（と、それより前にキューに積まれたイベント）を送り終えてから Checkout へ移動する
- 「すでに Premium」の案内を、ログイン失敗の案内と同じ見た目にする

対象外:
- ログイン済みの人がボタンから Checkout へ進むときの計測（`app/pricing/pricing-form.tsx` の既存の `trackBeginCheckout`）。ページを読み込んでからボタンを押すので gtag は読込済みのことが多い。変えるなら T5 で扱う
- メールのリンクを別のブラウザでも使えるようにする変更（認証メールのテンプレートはモバイルアプリと共用。`reference_supabase_auth_email_template` 参照）
- Google の同意画面に Supabase のドメインが表示される件
- `CheckoutSuccessTracker` の置き場所

## データモデル変更

なし。

## API サーフェス

### `GET /auth/callback`（`app/auth/callback/route.ts`）

戻り先の決め方は #933 のまま（`new URL(next, origin)` で解釈し、origin の一致・`/` 始まり・`/auth/` 以外だけを採用）。その後に次を足す。

1. 採用した戻り先のクエリから `auth_error` と `signup` を消す（`URL.searchParams.delete`）。他のクエリと hash は残す。
2. **成功時：** 今と同じ。新規登録なら `signup=success` を付ける。
3. **失敗時**（`code` が無い、または `exchangeCodeForSession` がエラー）：手順1の戻り先から `resume` も消し、`auth_error=1` を付けてリダイレクトする。`next` が無い・不正なら、今と同じ `/?auth_error=1`。

| `next` | 結果 | リダイレクト先 |
|---|---|---|
| `/?auth_error=1` | 成功・既存ユーザー | `/` |
| `/pricing?resume=checkout&auth_error=1` | 成功・既存ユーザー | `/pricing?resume=checkout` |
| `/matches/1e74662b-af45-4ef1-b267-156eb87329d5?signup=success` | 成功・既存ユーザー | `/matches/1e74662b-af45-4ef1-b267-156eb87329d5` |
| `/pricing?resume=checkout` | 成功・新規登録 | `/pricing?resume=checkout&signup=success` |
| `/pricing?resume=checkout` | 失敗 | `/pricing?auth_error=1` |
| `/c/urc/2025-26?tab=schedule#fixtures` | 失敗 | `/c/urc/2025-26?tab=schedule&auth_error=1#fixtures` |
| なし | 失敗 | `/?auth_error=1` |
| `@evil.example` | 失敗 | `/?auth_error=1` |
| `/auth/callback?code=x` | 失敗 | `/?auth_error=1` |

#933 で足した9ケースの表（`specs/fix-auth-purchase-intent-return.md`）は、すべてそのまま通ること。

### `lib/analytics.ts`

ページを離れる直前に使う関数を1つ足して export する。

```ts
export function trackEventBeforeNavigation(
  eventName: string,
  params?: AnalyticsEventParams,
): Promise<void>;
```

- gtag が無ければ、`GTAG_POLL_INTERVAL_MS` ごとに確かめて最大 **1,500ms** 待つ。
- gtag が使えるようになったら、まず `flushQueue()` でキューを送る。そのあと `window.gtag("event", eventName, { ...params, event_callback, event_timeout: 1000 })` を送る。
- `event_callback` が呼ばれたとき、または送信から **1,000ms** 経ったときに resolve する。どちらか早いほうで1回だけ resolve する。
- 1,500ms 待っても gtag が無ければ、イベントはキューに積んだうえで resolve する（送れないことを理由に移動を止めない）。
- **reject しない。** 合計の待ち時間は最大 2,500ms。
- 既存の `trackEvent` と同じく、GA4 の予約キー（`analytics-gtag-queue.test.ts` の「reserved attribution keys」のテスト）を送らない。
- `trackBeginCheckoutBeforeNavigation(params: CtaClickParams)` も足す。中身は `trackEventBeforeNavigation("begin_checkout", params)`。

## UI サーフェス

### 購入の再開（`app/pricing/pricing-auth-resume.tsx`）

- `trackBeginCheckout(...)` を `await trackBeginCheckoutBeforeNavigation(...)` に置き換え、resolve してから `form.submit()` する。引数（`cta_id: "pricing_auth_resume"`・`cta_location: "auth_resume"`・`destination: "/api/stripe/checkout"`）は変えない。
- 「決済ページへ移動しています…」は待っている間も表示する。
- POST が1回だけであること、Strict Mode で2回走っても1回であることは今のまま。
- `if (error) throw error` は、その前の `!user` で抜けるため実際には動かない。`getUser()` がエラーを返したときは何もしない（未ログインと同じ扱い）形に整理する。

### `sign_up` の送信（`components/signup-success-tracker.tsx`）

- `app/page.tsx` から外し、`app/layout.tsx` の `<ReturnVisitTracker />` の隣に置く。**`<Suspense fallback={null}>` で囲む。**
- 送ったあと、`history.replaceState` で URL から `signup` を消す（再読み込みや別ページへのログインで二重に送らない）。他のクエリと hash は残す。
- `CheckoutSuccessTracker` はホームに残す。

### ログイン失敗の案内（新規、全ページ）

`components/` に、`auth_error=1` を見て案内を出すクライアント部品を1つ足す。`app/layout.tsx` の `<SiteHeader />` の直後に `<Suspense fallback={null}>` で囲んで置く。

- `auth_error=1` のときに出す文言（`role="alert"`）：
  - 「ログインできませんでした。」
  - 「メールのリンクは、メールアドレスを入力したのと同じブラウザで開いてください。リンクの期限が切れている場合は、もう一度ログインしてください。」
- 表示したら `history.replaceState` で URL から `auth_error` を消す（他のクエリと hash は残す）。案内は閉じるボタンで消せる。
- 料金ページなら、案内を読んだ人はそのまま「Premium を始める」や「Google でログイン」を押し直せる（失敗時の戻り先を料金ページにするのはこのため）。

### 「すでに Premium」の案内

`pricing-auth-resume.tsx` の「すでに Premium をご利用中です。」を、ログイン失敗の案内と同じ見た目にする（今はヘッダー下の小さな1行）。役割は `role="status"` のまま。

### 見た目の決まり

- 色・余白・角丸は既存のトークン（`app/globals.css` の `--color-*` など）を使う。新しい色をハードコードしない。
- 幅 375px と 1280px で、料金ページの `?auth_error=1` と `?already_premium=1` のスクリーンショットを PR に貼る。

### 静的生成を壊さない

`app/layout.tsx` に `useSearchParams` を使う部品を2つ置く。どちらも `<Suspense>` の中に置けば、ページ全体がクライアント描画になることはない（`specs/fix-hub-schedule-server-rendering.md` の前例）。**`pnpm build` のルート表で、`○`・`●`・`ƒ` の数と `/`・`/pricing` の記号が main と同じであること**を受け入れ条件に入れる。

## LLM 連携

なし。

## 受け入れ条件

1. **callback：** `tests/app/auth-callback-route.test.ts` に、上の表の9行が全部あり、表どおりになる。#933 の9ケースと「新規登録 + resume」のテストもそのまま通る。
2. **送り終えてから移動：** `tests/lib/analytics-gtag-queue.test.ts`（または新しいテストファイル）で、`trackEventBeforeNavigation` について次を確かめる（fake timers を使う）。
   - gtag があるとき：`event_callback` を呼ぶまで resolve しない。呼べば resolve する。
   - `event_callback` が呼ばれないとき：1,000ms で resolve する。
   - gtag が 800ms 後に現れるとき：キューの古いイベント → `begin_checkout` の順で gtag が呼ばれる。
   - gtag が最後まで現れないとき：1,500ms で resolve し、reject しない。
3. **再開部品：** `tests/components/pricing-auth-resume.test.tsx` で、`trackBeginCheckoutBeforeNavigation` の Promise が resolve するまで `form.submit` が呼ばれず、resolve 後に1回だけ呼ばれる。既存の4ケース（ログイン済み・未ログイン・already_premium・クエリなし）もそのまま通る。
4. **sign_up：** `/pricing?signup=success` で `sign_up` が1回送られ、URL から `signup` だけが消える。`tests/app/home-page.test.tsx`・`tests/components/success-trackers.test.tsx`・`tests/components/gtag-load-race.test.tsx` のうち、`SignupSuccessTracker` の置き場所に依存するテストは新しい置き場所に合わせる。送る条件と送る回数のアサーションは弱めない。
5. **ログイン失敗の案内：** `auth_error=1` で案内の2文が出て、URL から `auth_error` だけが消える。`auth_error` が無いときは何も出ない。
6. **静的生成：** `pnpm build` のルート表で `/` と `/pricing` の記号が main と同じ。`○`・`●`・`ƒ` それぞれの数も main と同じ。main と PR の該当行を PR 本文に並べて貼る。
7. **わざと壊して確かめる：**
   - callback で `auth_error` を消す処理を外すと、表の1行目（`/?auth_error=1` → `/`）が落ちる。
   - 再開部品の `await` を外す（Promise を待たずに submit する）と、受け入れ条件3が落ちる。
   - どちらも出力を PR 本文に貼り、変更は戻す。
8. **本番での確認（Claude、マージ・デプロイ後）：**
   - 料金ページ → メールのリンクで Checkout まで進め、その直後に GA4 リアルタイムで `begin_checkout` が1件以上ある。Checkout 画面で止め、カード情報は入力しない。
   - `/pricing?auth_error=1` で案内が出て、URL から `auth_error` が消える。

## 未解決の質問

なし。案内の文言は Owner の了承済みの方針（2026-10-11「まとめて良い」）の範囲で Claude が決めた。違和感があれば PR のスクリーンショットで直す。
