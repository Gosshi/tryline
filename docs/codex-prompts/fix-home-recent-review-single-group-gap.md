`/specs/fix-home-recent-review-single-group-gap.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- Ownerが本番サイト（1920px幅）で実機確認・スクリーンショットで再現済みのバグ: トップページ「最近のレビュー」セクション（`app/page.tsx:433-620`）が `xl:grid-cols-2` の2カラムグリッドだが、`recentReviewGroups`（`getRecentlyReviewedCompetitionGroups`、`lib/db/queries/matches.ts:831`）が1件しかない状態のとき、2列目が空白のまま右側に大きな余白ができる
- 同じグリッド内の「無料サンプルを読む」カード（`app/page.tsx:440`）には既に `xl:col-span-2` が付与され単独でも全幅になっている。`recentReviewGroups.map(...)` で生成される大会グループのカード（`app/page.tsx:511`）にはこの分岐がない

やること:
- `recentReviewGroups.length === 1` の場合、そのグループのカード（`app/page.tsx:511` の `<div className="space-y-2" ...>`）に `xl:col-span-2` を付与し、単独表示時は全幅にする
- `recentReviewGroups.length >= 2` の場合は現状通り2カラム表示を維持する

処理すべきエッジケース:
- `recentReviewGroups` が0件（サンプルレビューのみ表示）のケースでレイアウトが崩れないこと

完了の定義:
- specの受け入れ条件1〜5を満たす（5番目のOwner目視確認は、実装後にスクリーンショットを添えて報告し、Owner確認を待つ形でよい）
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- グリッドのカラム数自体（`xl:grid-cols-2`）は変更しない
- 「無料サンプルを読む」カードの表示ロジックは変更しない
- 他セクション（「最近レビューのある大会」等）のグリッドは対象外
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 1920px・1440pxのスクリーンショット（1件時に全幅になっていること、2件以上時に2カラムのままであること両方）を添付する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
