`/specs/fix-match-detail-next-watch-position.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- `app/matches/[id]/page.tsx`の`<NextWatchSection>`（`components/match-detail-user-state.tsx`）が現在ページ最後尾（`<PremiumMatchChat>`の後）にあり、Google経由の即時回答ユーザーに届きにくい
- `NextWatchSection`が受け取る`nextMatches`・`relatedRecaps`・`teams`はページ冒頭で既に計算済みのため、新規データ取得は不要で描画位置の移動のみで対応できる
- **重要**: スコアヘッダー直後・本文より前に移動すると、Google検索者が求めているプレビュー/レビュー本文を後ろに押し下げてしまう。正しい移動先は本文（`MatchContentSection`）の直後、`MatchLineupsSection`より前

やること:
- `<NextWatchSection>`を、本文（`MatchContentSection`）の直後、`<MatchLineupsSection>`の前に移動する
- 現在の最後尾（`<PremiumMatchChat>`直後）の`<NextWatchSection>`は削除し、重複表示させない

処理すべきエッジケース:
- 移動後も`nextMatches`が空・`relatedRecaps`が空のケースで既存の空状態表示（「次戦は未定です」等）が正しく機能すること

完了の定義:
- specの受け入れ条件1〜6を満たす（6番目のOwner目視確認は、実装後にスクリーンショットを添えて報告し、Owner確認を待つ形でよい）
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- `NextWatchSection`コンポーネント自体は変更しない（描画位置の移動のみ）
- 新規コンポーネントの作成・複製表示はしない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 移動後のページのスクリーンショット（「次に見る」が本文直後・ラインナップより前に表示されている状態）を添付する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
