# ログイン後に Premium の購入を再開する

計画: `docs/dev-plan-2026-10-12.md` T1。Owner 決定 A（2026-10-11）：ログイン後は Stripe Checkout へ直行する。

## 背景

料金ページで未ログインの人が「Premium を始める」を押すと、ログインのモーダルが開き、「ログイン後、自動的に決済ページに移動します。」と表示される（`components/auth-modal.tsx:161`、文言の出典は `specs/p6-login-modal-context.md`）。しかし、この移動は一度も実装されていない。

- `components/auth-modal.tsx:107`（Magic Link）と `:139`（Google）は、戻り先を `/auth/callback` だけにしている。
- `app/auth/callback/route.ts:10` は `next` が無いとき `/` に戻す。
- その結果、購入しようとした人はログイン後にホームへ置き去りになる。

直近28日（9/11〜10/8）で料金ページを見たのは6人。この6人の購入意思を失わせている、確認済みの欠陥である。

調べる途中で、さらに2つの穴が見つかった。

1. **戻り先の `next` を検証していない。** `new URL(\`${origin}${next}\`)` に連結しているため、`next=@evil.example` を渡すと遷移先のホストが `evil.example` になる（Node の `new URL("https://www.trylinerugby.com@evil.example").host` で確認）。今回 `next` を使い始めるので、検証は必須。
2. **すでに Premium の人も Checkout を作れる。** `app/api/stripe/checkout/route.ts` は Premium かどうかを確認せずにセッションを作る。二重購読になりうる。

## スコープ

対象:
- 料金ページで購入しようとした未ログインの人が、ログイン後に Stripe Checkout へ進む（Google と Magic Link の両方）
- callback の `next` の検証
- Checkout を作る前に、すでに Premium かどうかを確認する
- すでに Premium だった人には、料金ページでその旨を表示する
- ヘッダーからの通常ログインも、ホームではなく元のページに戻す（同じ仕組みで済むため）

対象外:
- Checkout の中身（価格・trial・`success_url`・`cancel_url`）の変更
- `trial_start`／`begin_checkout` 以外の計測の追加（T5 で扱う）
- iOS アプリ（認証は別経路）
- 既存の `isUuid` の重複の整理

## データモデル変更

なし。

## API サーフェス

### `GET /auth/callback`（`app/auth/callback/route.ts`）

`next` を次の手順で決める。

1. `next` が無い、または文字列でなければ `/`。
2. `new URL(next, origin)` で解釈し、**結果の `origin` がリクエストの `origin` と一致しない**、または `next` が `/` で始まらないときは `/`。
3. 一致したら、解釈した URL の `pathname + search + hash` を戻り先にする（`origin` は付け直す）。
4. `/auth/` で始まるパスは `/` にする（callback への自己転送を防ぐ）。

新規登録の `signup=success` の付与は今のまま。戻り先にクエリが既にあっても `URL.searchParams.set` で足す。

| `next` | 戻り先 |
|---|---|
| なし | `/` |
| `/pricing?resume=checkout` | `/pricing?resume=checkout` |
| `/matches/1e74662b-af45-4ef1-b267-156eb87329d5` | 同じ |
| `@evil.example` | `/` |
| `//evil.example` | `/` |
| `/\evil.example` | `/` |
| `https://evil.example/` | `/` |
| `javascript:alert(1)` | `/` |
| `/auth/callback?code=x` | `/` |

### `POST /api/stripe/checkout`（`app/api/stripe/checkout/route.ts`）

- `requireUser()` の後、セッションを作る前に `isPremium(user.id)`（`lib/auth/server.ts:77`）を確認する。
- Premium なら Stripe を呼ばず、`303` で `${SITE_URL}/pricing?already_premium=1` に送る。
- Premium の判定は `premium_until` だけで決まる。手動付与（`manual`）や Apple の Premium も対象になる。これは意図どおり（どの経路でも二重購読を防ぐ）。

## UI サーフェス

### `AuthModal`（`components/auth-modal.tsx`）

- props に `returnPath?: string` を足す。
- Magic Link の `emailRedirectTo` と Google の `redirectTo` を、`/auth/callback?next=<encodeURIComponent(returnPath)>` にする。
- `returnPath` が無いときは、モーダルを開いた時点のページ（`location.pathname + location.search`）を使う。
- 文言は変えない。ただし `intent="subscribe"` でメールを送った後の文を「メールを送りました。リンクを開くと決済ページに進みます。」にする（`intent="login"` は今のまま）。

### `PricingForm`（`app/pricing/pricing-form.tsx`）

- `intent="subscribe"` のときは、`AuthModal` に `returnPath="/pricing?resume=checkout"` を渡す。`intent="login"` のときは渡さない（今いるページに戻る）。
- ログイン済みのときの動き（フォーム送信と `trackBeginCheckout`）は変えない。

### 料金ページで購入を再開する（新規のクライアント部品）

`app/pricing/` に、URL のクエリを見て動く小さなクライアント部品を1つ足し、料金ページに置く。

- **`resume=checkout` があるとき：**
  1. `history.replaceState` でクエリから `resume` を消す（戻るボタンで再実行させない）。
  2. ログインしていなければ、何もしない。
  3. ログインしていれば、`trackBeginCheckout({ cta_id: "pricing_auth_resume", cta_location: "auth_resume", destination: "/api/stripe/checkout" })` を1回送り、`/api/stripe/checkout` へ POST するフォームを1回だけ送信する。
  4. 送信中は「決済ページへ移動しています…」を表示する。
- **`already_premium=1` があるとき：** 「すでに Premium をご利用中です。」を表示する。表示後に `history.replaceState` でクエリを消す。お支払い管理へのリンクは出さない（Stripe の顧客かどうかはブラウザ側で分からず、Apple・手動付与の人には `/api/stripe/portal` が 400 を返すため）。
- 料金ページは今は静的に生成されている（`app/pricing/page.tsx:118` は `searchParams` を受け取らない）。**`useSearchParams` を使う部品は必ず `<Suspense>` で囲み、ページ全体をクライアント描画にしない。** 大会ページで同じ原因により日程がサーバー HTML から消えた前例がある（`specs/fix-hub-schedule-server-rendering.md`）。
- React の Strict Mode で effect が2回走っても、POST は1回だけにする（`useRef` で送信済みを記録）。

### ヘッダーからのログイン

`components/user-menu.tsx:69` と `components/mobile-header-menu.tsx:117` の `AuthModal` は変更不要（`returnPath` が無いので、今いるページに戻る）。

## LLM 連携

なし。

## 受け入れ条件

1. **`next` の検証：** `tests/app/auth-callback-route.test.ts` に、上の表の9行すべてのケースがある。戻り先がすべて表どおりになる。`next` に `?resume=checkout` があり、かつ新規登録のときは、戻り先が `/pricing?resume=checkout&signup=success` になる。
2. **戻り先の受け渡し：** `tests/components/auth-modal.test.tsx` で、`returnPath="/pricing?resume=checkout"` を渡すと、Magic Link の `emailRedirectTo` と Google の `redirectTo` がどちらも `<origin>/auth/callback?next=%2Fpricing%3Fresume%3Dcheckout` になる。`returnPath` が無いときは、テスト時点の `location.pathname + location.search` がエンコードされて入る。
3. **二重購読の防止：** `tests/app/stripe-checkout-route.test.ts` で、`premium_until` が未来のユーザーは `stripe.checkout.sessions.create` が呼ばれず、`303` で `/pricing?already_premium=1` に送られる。期限切れ・`null` のユーザーは今までどおりセッションが作られる。
4. **購入の再開：** 再開部品のテストで、次の4ケースを確認する。
   - `resume=checkout`・ログイン済み：POST が1回だけ送られ、`begin_checkout` が `cta_location: "auth_resume"` で1回送られる。effect を2回走らせても1回。
   - `resume=checkout`・未ログイン：何も送られない。
   - `already_premium=1`：案内文が出る。
   - クエリなし：何も出ず、何も送られない。
5. **料金ページが静的のまま：** `pnpm build` の出力で、`/pricing` が今と同じ静的（○ または ●）のまま。ビルド出力の該当行を PR 本文に貼る。
6. **わざと壊して確かめる：** callback の検証を外す（`${origin}${next}` に戻す）と受け入れ条件1の `@evil.example` のケースが落ちる。checkout の Premium 確認を外すと受け入れ条件3が落ちる。どちらも出力を PR 本文に貼り、変更は戻す。
7. **プレビューでの確認（Owner）：** Vercel プレビューで次を確認する。購入はしない。
   - 未ログイン → 料金ページ「Premium を始める」→ Magic Link → メールのリンク → Stripe の**テスト** Checkout 画面が開く。
   - 同じことを Google ログインで行う。
   - Premium のアカウント（手動付与のもの）で同じことをすると、Checkout は開かず「すでに Premium をご利用中です。」が出る。

## 未解決の質問

1. **【着手前に Owner が確認】Supabase の Redirect URLs：** Supabase の Authentication → URL Configuration の Redirect URLs に、`?next=...` 付きの callback が許可されているか確認する。許可されていないと、Supabase は既定の Site URL に戻すため、この修正は本番で効かない。本番は `https://www.trylinerugby.com/auth/callback**`、プレビューは Vercel のプレビュー用ドメインの同じ形を想定。登録されている値を貼ってもらえれば、Claude が足りるか判断する。
2. **【Owner 確認】決定Aの「/account」：** 計画書では「すでに Premium の人は `/account` へ」としていたが、`/account` というページは存在しない（`app/account` が無い）。代わりに、この spec では「`/pricing?already_premium=1` で案内を出す」としている。お支払いの管理は今もヘッダーのメニュー（`components/user-menu.tsx:111`）から行える。これで良いか。
