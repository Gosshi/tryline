# fix-home-recent-review-single-group-gap

## 背景

Owner が本番サイト（`https://www.trylinerugby.com/`）で実機確認したスクリーンショット（2026-07-21）で判明: トップページの「最近のレビュー」セクション（`app/page.tsx:433-620`）が `xl:grid-cols-2` の2カラムグリッド（`app/page.tsx:438`）になっているが、`recentReviewGroups`（`getRecentlyReviewedCompetitionGroups`、`lib/db/queries/matches.ts:831`）が現在1件（ネーションズチャンピオンシップ2026）しか返さない状態のとき、1列目にカードが表示され2列目が空白のまま、画面右側に大きな余白ができる。

同じグリッド内の「無料サンプルを読む」カード（`app/page.tsx:440`）には `xl:col-span-2` が付与されており単独でも全幅表示になるが、`recentReviewGroups.map(...)` で生成される大会グループのカード（`app/page.tsx:511`）には同様の分岐がなく、1件のみの場合でもグリッドの1列分の幅に固定される。

## スコープ

対象:
- `app/page.tsx` の「最近のレビュー」グリッド（438行目付近）で、`recentReviewGroups.length === 1` の場合、そのグループのカード（511行目の `<div className="space-y-2" ...>`）に `xl:col-span-2` を付与し、単独表示時は全幅になるようにする
- `recentReviewGroups.length >= 2` の場合は現状通り `xl:grid-cols-2` の2カラム表示を維持する

対象外:
- グリッドのカラム数自体の変更（`xl:grid-cols-2` を3カラム化する等）
- 「無料サンプルを読む」カードの表示ロジック変更
- `reviewedFamilies`（「最近レビューのある大会」セクション、622行目以降）等、他セクションのグリッド
- `recentReviewGroups` を返すクエリ自体（`getRecentlyReviewedCompetitionGroups`）の変更

## データモデル変更

なし。既存の `recentReviewGroups` 配列の件数分岐のみ。

## UI サーフェス

- 参照: `app/page.tsx:440` の「無料サンプルを読む」カードに既に適用されている `xl:col-span-2` パターンをそのまま踏襲する
- **完了の定義にビジュアル確認を含める**: 実装後、Owner が1920px・1440pxで「最近のレビュー」セクションを確認し、大会グループが1件のときに右側の空白が解消されていることを承認する

## 受け入れ条件

1. `recentReviewGroups` が1件のとき、そのカードが `xl:` 幅でグリッド全幅（`xl:col-span-2` 相当）に表示されることを確認するテストがある
2. `recentReviewGroups` が2件以上のとき、従来通り2カラムで表示されることを確認する回帰テストがある
3. `recentReviewGroups` が0件（サンプルレビューのみ表示）のケースでレイアウトが崩れないこと
4. `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` が通る
5. Owner による1920px・1440pxのスクリーンショット目視確認で承認を得ること

## 未解決の質問

- なし
