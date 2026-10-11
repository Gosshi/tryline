# Codex 指示書: ログイン後に Premium の購入を再開する

仕様書: `specs/fix-auth-purchase-intent-return.md`（受け入れ条件は仕様書を正とする）

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。** 仕様書と実際のコードが食い違っていたら、実装を進めずにその場で止めて報告する。

**着手の前提：** 仕様書の「未解決の質問」1（Supabase の Redirect URLs）と 2（`/account` の代わりの案内）は、Owner が確認してから着手する。Owner がこの指示書を渡した時点で確認済みとして扱ってよい。

## やること
- `app/auth/callback/route.ts`：`next` を仕様書の手順（`new URL(next, origin)` で解釈し、origin が一致する `/` 始まりのパスだけを採用。`/auth/` で始まるパスは `/` にする）で検証する。
- `app/api/stripe/checkout/route.ts`：セッションを作る前に `isPremium(user.id)`（`lib/auth/server.ts`）を確認し、Premium なら Stripe を呼ばずに `303` で `/pricing?already_premium=1` へ送る。
- `components/auth-modal.tsx`：`returnPath?: string` を足す。Magic Link と Google の両方で `/auth/callback?next=<encodeURIComponent(returnPath)>` を渡す。指定が無いときは、モーダルを開いた時点の `location.pathname + location.search` を使う。`intent="subscribe"` でメールを送った後の文を仕様書のとおりに変える。
- `app/pricing/pricing-form.tsx`：`intent="subscribe"` のときだけ `returnPath="/pricing?resume=checkout"` を渡す。
- `app/pricing/` に、`resume=checkout` と `already_premium=1` を処理するクライアント部品を1つ足し、`app/pricing/page.tsx` に置く。**`<Suspense>` で囲む。**
- 受け入れ条件1〜4のテストを、既存の `tests/app/auth-callback-route.test.ts`・`tests/components/auth-modal.test.tsx`・`tests/app/stripe-checkout-route.test.ts` への追加と、再開部品の新しいテストで書く。

## 守ること
- 料金ページは静的生成のまま保つ。`app/pricing/page.tsx` で `searchParams` を受け取らない。`useSearchParams` は新しい部品の中だけで使う。
- 再開の POST は、Strict Mode で effect が2回走っても1回だけにする。送る前に `history.replaceState` で `resume` を消す。
- `begin_checkout` は、仕様書に書いた `cta_id`・`cta_location`・`destination` で1回だけ送る。`trial_start` と `success_url`・`cancel_url` は変えない。
- Checkout の価格・trial・決済手段は変えない。新しい依存パッケージを足さない。
- Stripe の本番キーを使わない。テストでは Stripe と Supabase をモックする。本番 DB には触らない。

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて必ず実行し、結果を完了報告に含める。**
- PR 本文に貼るもの：
  - 受け入れ条件5：`pnpm build` 出力のうち `/pricing` の行
  - 受け入れ条件6：callback の検証と checkout の Premium 確認をそれぞれ外したときに、テストが落ちた出力（どちらの変更も戻す）
- 受け入れ条件7（プレビューでの購入直前までの確認）は Owner が行う。PR 本文に、確認する手順を3ケース分の箇条書きで書く。
- PR を出したら、マージを待つ。
