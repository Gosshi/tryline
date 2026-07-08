`/specs/feat-paywall-impression-event.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 既存の GA4 トラッキングパターンは `components/checkout-success-tracker.tsx`（クライアントコンポーネント + `useEffect` + `window.gtag`）を参照する
- `components/paywall.tsx` は現状サーバーコンポーネント。ロック UI 判定（`isPremium`）自体は変更せず、クライアント側の発火用コンポーネントを追加する形にする
- `components/match-chat.tsx` のロック状態判定ロジックの場所は事前に読んで把握してから着手する

入出力の例:
- `<Paywall isPremium={false} contentType="recap" matchId="abc">...</Paywall>` を描画 → `window.gtag("event", "paywall_view", { content_type: "recap", match_id: "abc" })` が1回呼ばれる
- `<Paywall isPremium={true} ...>` → `paywall_view` は呼ばれない

処理すべきエッジケース:
- `Paywall` の呼び出し元（`components/match-content.tsx` 等）で `contentType`/`matchId` を渡せない箇所がある場合、`contentType` は必須props、`matchId` は任意propsとして扱い、渡せる範囲だけ渡す
- 同一ページに `Paywall` が複数描画されるケースでの重複発火は許容する（spec の未解決の質問を参照。ページ単位の重複排除は不要）

完了の定義:
- specs の受け入れ条件 1〜6 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- `paywall.tsx` / `match-chat.tsx` の呼び出し元一覧と、それぞれに `contentType`/`matchId` を渡せたかどうかを完了報告に含める

要件:
- 「スコープ対象外」（GA4側の探索レポート作成、cta_click イベント自体の変更）は実装しない
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
