# Codex 指示書: ログイン後の戻り先と計測の取りこぼしを直す

仕様書: `specs/fix-auth-return-followups.md`（受け入れ条件は仕様書を正とする）

`AGENTS.md` の規約に従う。**最新の `origin/main` からブランチを切る。** 仕様書と実際のコードが食い違っていたら、実装を進めずにその場で止めて報告する。前提の PR #933 はマージ済み。

## やること
- `app/auth/callback/route.ts`：戻り先から `auth_error` と `signup` を消す。失敗時は、検証済みの戻り先から `resume` も消して `auth_error=1` を付ける（仕様書の表どおり）。
- `lib/analytics.ts`：`trackEventBeforeNavigation` と `trackBeginCheckoutBeforeNavigation` を足す（gtag を最大 1,500ms 待つ → `flushQueue()` → `event_callback` か 1,000ms のどちらか早いほうで resolve。reject しない）。
- `app/pricing/pricing-auth-resume.tsx`：`await trackBeginCheckoutBeforeNavigation(...)` の後に `form.submit()`。`getUser()` のエラーは未ログインと同じ扱いにする。「すでに Premium」の案内の見た目を、ログイン失敗の案内とそろえる。
- `components/signup-success-tracker.tsx`：送ったあと URL から `signup` を消す。`app/page.tsx` から外し、`app/layout.tsx` に `<Suspense fallback={null}>` で囲んで置く。
- `components/` に、`auth_error=1` を見て案内を出す部品を新しく作る。`app/layout.tsx` の `<SiteHeader />` の直後に `<Suspense fallback={null}>` で囲んで置く。
- 受け入れ条件1〜5のテストを書く。対象は既存の `tests/app/auth-callback-route.test.ts`・`tests/lib/analytics-gtag-queue.test.ts`・`tests/components/pricing-auth-resume.test.tsx`・`tests/components/success-trackers.test.tsx`・`tests/components/gtag-load-race.test.tsx`・`tests/app/home-page.test.tsx` と、新しい案内部品のテスト。

## 守ること
- `/` と `/pricing` を静的生成のまま保つ。`useSearchParams` を使う部品は、必ず `<Suspense>` の中に置く。ページの `searchParams` は受け取らない。
- #933 で入れた戻り先の検証（9ケース）、POST が1回だけであること、`begin_checkout` の引数は変えない。
- `trackEventBeforeNavigation` は reject しない。計測が失敗しても Checkout への移動は止めない。
- 既存のテストのアサーションを弱めない。置き場所の変更に合わせて書き換えるだけにする。
- 色や余白は既存のトークンを使い、ハードコードしない。新しい依存パッケージを足さない。
- Stripe の本番キーと本番 DB には触らない。テストでは Supabase・Stripe・gtag をモックする。

## 検証
- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build`。**すべて実行し、結果を完了報告に含める。** ローカルでの build が DB 接続で止まるときは、どこで止まったかを書く（この場合はプレビューデプロイのビルドで判断する）。
- PR 本文に貼るもの：
  - 受け入れ条件6：main と PR の `pnpm build` のルート表から、`/` と `/pricing` の行と、`○`・`●`・`ƒ` の数
  - 受け入れ条件7：わざと壊したときにテストが落ちた出力を2つ（どちらの変更も戻す）
  - 幅 375px と 1280px での、`/pricing?auth_error=1` と `/pricing?already_premium=1` のスクリーンショット
- 受け入れ条件8（本番での確認）は、マージ後に Claude が行う。
- PR を出したら、マージを待つ。
