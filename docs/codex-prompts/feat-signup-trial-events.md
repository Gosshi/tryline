`/specs/feat-signup-trial-events.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 既存の GA4 トラッキングパターンは `components/checkout-success-tracker.tsx` を参照する（`SignupSuccessTracker` はこれと同一パターンで新設）
- 認証コールバックは `app/auth/callback/route.ts`。ログイン導線の全体像を把握するため、着手前に `components/auth-modal.tsx` を読み、`app/auth/callback/route.ts` を経由しない認証経路が無いか確認する（spec の未解決の質問を参照）
- Stripe Checkout の `trial_period_days: 7` は `app/api/stripe/checkout/route.ts:29` に既存

入出力の例:
- 新規ユーザー（`data.user.created_at` が現在時刻から60秒以内）がOAuthログインを完了 → リダイレクト先URLに `?signup=success` が付与される
- 既存ユーザーの再ログイン（`created_at` が60秒より前）→ `?signup=success` は付与されない
- `?checkout=success` を含むページ表示 → `purchase` と `trial_start` の両方のイベントが発火する

処理すべきエッジケース:
- `next` パラメータで別ページにリダイレクトする場合、そのリダイレクト先に `SignupSuccessTracker` が設置されていなければ `sign_up` は計測されない。ホーム（`app/page.tsx`）への設置は必須だが、他の主要リダイレクト先（例: `/pricing`）にも設置が現実的か確認し、対応した範囲を完了報告に明記する
- `app/auth/callback/route.ts` を経由しない認証経路（マジックリンク等）がある場合、その経路では `sign_up` が計測できない旨を完了報告に明記する（実装で無理に対応しようとしない）

完了の定義:
- specs の受け入れ条件 1〜7 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean

要件:
- 「スコープ対象外」（purchase イベント自体の変更、Stripeトライアル期間設定の変更、GA4側レポート作成）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
