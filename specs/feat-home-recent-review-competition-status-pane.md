# feat-home-recent-review-competition-status-pane

## 背景

`fix-home-recent-review-single-group-gap.md`（PR #621、マージ済み）で、トップページ「最近のレビュー」セクションの`recentReviewGroups`が1件のときにカードを`xl:col-span-2`で全幅表示するようにしたが、Owner が実機確認したところ、カードの中身（スコアヒーロー＋直近5試合の簡易リスト）が元々1カラム幅想定の密度のため、全幅に引き伸ばされても情報量が増えず間延びして見える（2026-07-21 スクリーンショットで確認）。

GPT-5.6に「この空きスペースに何を置くべきか」を相談した結果（2026-07-21）、以下の方針が固まった:
- ニュースitem案は不採用: `match_sourced_facts`の`fact_ja`が全件null（未整備）、かつ試合前情報限定の設計のため、終わった試合の隣に出すと文脈が合わない（別途調査済み）
- 推奨案: 「大会の現在地」ペイン。右側に大会の現在の順位表（抜粋）＋次戦情報を出し、「試合結果 → 大会への影響 → 次に見る試合」という回遊導線を作る
- 新規データパイプライン不要。既存の`getStandingsForCompetition`・`getNextMatchForCompetition`・`StandingsTable`コンポーネントの組み合わせで完結する

## スコープ

対象:
- `app/page.tsx`の「最近のレビュー」セクションで、`recentReviewGroups.length === 1`の場合のみ、カードを左右2ペイン（目安7:5、`lg:grid-cols-[7fr_5fr]`程度）に再構成する
  - 左ペイン: 既存のヒーローレビューカード＋同節の簡易リスト（現状のまま）
  - 右ペイン「大会の現在地」: 以下の2要素
    1. 順位表抜粋: `getStandingsForCompetition(group.competition.slug)`を呼び、既存の`<StandingsTable>`コンポーネント（`components/standings-table.tsx`）を`highlightedTeams`にヒーロー試合の両チーム名、`excerptThreshold`を小さめ（例: 5）に設定して使う。新規の順位表示ロジックは実装しない（既存コンポーネントの抜粋機能をそのまま使う）
    2. 次戦カード: `getNextMatchForCompetition({ family: group.competition.family, season: group.competition.season })`を呼び、日時・対戦カードをコンパクト表示。試合ページへリンク
  - 右ペイン下部に大会ハブページへのリンク（`/c/${group.competition.family}/${group.competition.season}`、既存パターン踏襲）
- `recentReviewGroups.length >= 2`の場合は`fix-home-recent-review-single-group-gap.md`実装後の現状（2カラムグリッド、各カードは簡易リストのみ）を維持する

対象外:
- ニュースitem・試合後アップデートの表示（データ未整備のため、`feat-match-stories-news-items.md`のPhase 2待ち）
- `getPoolStandingsForCompetition`（プール制大会向け順位表）の使用。既存の`app/matches/[id]/page.tsx`が`getStandingsForCompetition`のみを使いプール分岐をしていない前例に倣い、本specも同様にプール分岐は行わない
- 大会ヒーロー画像の追加（GPT-5.6の分析でも「情報密度でなく面積で埋めるだけ」と判断され不採用）
- Premium・お気に入りチームCTAの新規配置（既存のCTAと重複するため）
- `recentReviewGroups`の件数上限（`RECENTLY_REVIEWED_GROUP_LIMIT`）や取得ロジック自体の変更

## データモデル変更

なし。既存クエリの組み合わせのみ。

## API サーフェス

新規HTTP APIなし。既存クエリの再利用:
- `lib/db/queries/standings.ts`の`getStandingsForCompetition(competitionSlug: string): Promise<StandingRow[]>`
- `lib/db/queries/matches.ts`の`getNextMatchForCompetition({ family, season }): Promise<UpcomingMatch | null>`（既存の呼び出し元: `components/featured-competition-card.tsx`と同等のパターンに倣う）

`recentReviewGroups.length === 1`のときのみ`Promise.all`で上記2クエリを追加取得する（複数件のときは取得しない。無駄なクエリを増やさない）。

## UI サーフェス

- 参照: `components/standings-table.tsx`の`highlightedTeams`・`excerptThreshold`props、`app/matches/[id]/page.tsx`の次戦カード表示パターン
- 使用トークン: `--color-ink`・`--color-ink-muted`・`--color-rule`・`--color-accent`・`--color-accent-subtle`・`--radius-md`・`--shadow-soft`（`app/globals.css`で定義済み、新規ハードコード値を追加しない）
- 右ペインは独立した白背景カードとして浮かせるのではなく、罫線（`--color-rule`）や背景の濃淡で左ペインと一体化した「大会ボード」として見せる（均一な白カードの並置を避けるTryline のデザイン方針に沿う）
- **フォールバック**: 順位表・次戦のどちらも取得できない場合（`StandingRow[]`が空 かつ `UpcomingMatch`がnull）、右ペインを表示せず、`fix-home-recent-review-single-group-gap.md`実装時点の全幅単一カード表示にフォールバックする（空のペインを表示しない）
- モバイル幅では2ペイン構成をやめ、ヒーローレビュー→同節の簡易リスト→大会の現在地（順位表→次戦）の順に縦積みする
- **完了の定義にビジュアル確認を含める**: 実装後、Owner が1920px・1440px・375pxで確認し、右ペインの情報密度・レイアウトを承認する

## 受け入れ条件

1. `recentReviewGroups.length === 1`のとき、カードが左右2ペインに分かれ、右ペインに順位表抜粋（`<StandingsTable>`、ヒーロー試合の両チームをハイライト）と次戦情報が表示されることを確認するテストがある
2. 順位表抜粋で、ヒーロー試合の両チームが`highlightedTeams`としてハイライトされることを確認する
3. 次戦情報が存在しない場合、次戦ブロックのみ非表示になり順位表は表示されることを確認するテストがある
4. 順位表・次戦のどちらも取得できない場合、右ペイン全体が非表示になり、既存の全幅単一カード表示にフォールバックすることを確認するテストがある
5. `recentReviewGroups.length >= 2`のとき、従来通り2カラムグリッド表示のままであることを確認する回帰テストがある
6. 375px幅で2ペインが縦積みに切り替わり、オーバーフロー・横スクロールが発生しないこと
7. `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` が通る
8. Owner による1920px・1440px・375pxのスクリーンショット目視確認で承認を得ること

## 未解決の質問

- 左右ペインの比率（7:5目安）・順位表の`excerptThreshold`の具体値は、実装後のスクリーンショットを見てOwnerが微調整可能とする
