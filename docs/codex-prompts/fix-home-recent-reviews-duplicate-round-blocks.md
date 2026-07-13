`/specs/fix-home-recent-reviews-duplicate-round-blocks.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- 対象は `lib/db/queries/matches.ts` の `getRecentlyReviewedGroupKey`（665行目付近）と `buildRecentlyReviewedCompetitionGroups`（702行目付近）、および `RECENTLY_REVIEWED_ROUND_CAP` 定数（248行目付近）
- `pickRecentlyReviewedHero`（677行目付近）のレベルスコア選定ロジックは変更しない。グルーピングキーの変更により自動的にマージ後のエントリ集合に対して動作する想定
- `app/page.tsx` の「最近のレビュー」セクション（`recentReviewGroups.map()` 部分）はグループ配列を受け取って描画するだけの構造なので、レンダリング側の変更は基本的に不要な想定。もし変更が必要と判明したら実装前に立ち止まって報告すること

入出力の例:
- 現状: ネーションズチャンピオンシップ 2026 の第1節（NZ×フランス等）と第2節（南アフリカ×スコットランド等）が両方アクティブウィンドウ内にある場合、「ネーションズチャンピオンシップ 2026」という同じ見出しのブロックが2つ表示される
- 修正後: 上記の場合、1つのブロックにマージされ、ヒーローは両節を通じて最もレベルスコアが高い試合になり、コンパクト行に残りの試合が並ぶ

処理すべきエッジケース:
- 大会が1節分のデータしか持たない場合（従来通りの単一節ケース）は、マージしても挙動が変わらないこと
- `getRoundFromExternalIds` が `null` を返す試合（ラウンド情報なし）が混在する場合にクラッシュしないこと
- マージ後のエントリ数が `RECENTLY_REVIEWED_ROUND_CAP` を超える場合、上限で正しく打ち切られること（優先順位は既存の処理順=`generated_at`降順のまま）

完了の定義:
- specs の受け入れ条件 1〜6 をすべて満たす
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` clean
- 「同一大会・複数節マージ」のケースを検証する新規テストを `tests/` 配下の既存構成（`lib/db/queries/matches.ts` 関連のテストファイルの場所）に倣って追加する
- 本番相当データ（同一大会が複数節同時アクティブな状態を再現できるフィクスチャ、または実際のステージング/ローカルDBデータ）でホームページをブラウザ確認し、見出しの重複が解消されたことのスクリーンショットを完了報告に添付する

要件:
- スコープ対象外（ヒーロー選定スコアリングロジック自体の変更、`RECENTLY_REVIEWED_GROUP_LIMIT`・`RECENTLY_REVIEWED_ACTIVE_WINDOW_DAYS`の変更、`getRecentlyReviewedMatches`関数、大会ページ側のラウンドハブ）は実装しない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して Owner に確認する
- `RECENTLY_REVIEWED_ROUND_CAP`の具体的な調整値（未解決の質問参照）は実装判断で進めてよいが、判断の根拠を完了報告に記載する

完了時:
- 実装内容、変更ファイルを要約する
- スクリーンショット（修正前後の比較が望ましい）を報告する
- 仕様書からの逸脱があれば理由を明示する
