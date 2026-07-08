`/specs/feat-home-multi-competition-featured-reviews.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 前提となる2つのspec（`feat-world-rugby-rankings-ingestion.md` / `fix-top14-srp-standings-weekly.md`）は実装・マージ済み。`teams.world_ranking`（国代表チームの世界ランキング）と `competition_standings.position`（Top14・Premiership・URC・Six Nations・RWC・Super Rugby Pacificの順位）が本番DBで参照可能
- 対象は `lib/db/queries/matches.ts` の `getRecentlyReviewedMatches`（617行目付近。`fix-home-recent-reviews-round-grouping.md` で「直近1件が属する大会+節をまとめて返す」実装済み。今回はこれを「複数大会、それぞれの最新節」に拡張する）と `app/page.tsx` の「最近のレビュー」セクション（451-510行目付近）
- 既存の `RECENTLY_REVIEWED_MATCH_SELECT`（同ファイル319行目付近）に `home_team.id` / `away_team.id` と `home_team.world_ranking` / `away_team.world_ranking` 相当のデータが取得できるよう select 拡張が必要な場合がある。`competition_standings` は別途 `getStandingsForCompetition`（`lib/db/queries/standings.ts`）のクエリパターンを参考にしてよい

入出力の例:
- 変更前: `generated_at` 降順の候補プールから「直近1件の大会+節」だけを返す。ヒーローは常にその節内で `generated_at` が最新の1件
- 変更後: 候補プールを大会（family+season+round）ごとにグルーピングし、**各グループの最新 `generated_at` が直近7日以内のものだけ**を「アクティブな大会」として残す。各グループ内で「対戦カードのレベルスコアが最小（＝レベルが高い）」試合をヒーローに選ぶ:
  - 両チームに `world_ranking` がある（国代表戦）→ `home.world_ranking + away.world_ranking` が最小の試合
  - 大会に `competition_standings` データがある（クラブ戦）→ 両チームの `position` 合計が最小の試合
  - どちらも無ければ、そのグループ内で `generated_at` が最新の試合（現状の挙動を維持）
- ホームページには大会ごとに「見出し＋ヒーロー1件＋コンパクト行」のブロックが、アクティブな大会の数だけ縦に並ぶ

処理すべきエッジケース:
- アクティブな大会が1つだけの場合、現状の見た目（ブロック1つ）と実質同じになること
- ランキング・順位表データがどちらも無い大会グループでクラッシュしないこと（フォールバックで生成順の1件をヒーローにする）
- 7日を超えて更新のない大会グループは表示されないこと
- `recentReviews` を渡している既存のprops/型（`RecentlyReviewedMatch`）を大きく壊さないよう、大会ごとのグループを表す新しい型（例: `RecentlyReviewedCompetitionGroup { competition, hero, compact }`）を追加する形にしてよい

完了の定義:
- specs の受け入れ条件8項目すべてを満たす
- `pnpm test` で新規・既存のテストが通る（複数大会が同時にアクティブなケース、ランキング/順位表データなしのフォールバックケースを含む）
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 320/768/1024/1440pxで、大会ブロックが複数ある場合とアクティブな大会が1つだけの場合、両方のスクリーンショットを提示する

要件:
- 「対象外」にある項目（`getRecentlyReviewedMatchesForFamily`、大会アーカイブ等の他セクション、大会ブロックの並び順の恣意的な優先度付け）は実装しない
- 「直近7日以内」のウィンドウ幅・候補プール件数は妥当な値に調整してよい
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- アクティブ判定のウィンドウ幅・候補プール件数を最終的にいくつにしたか明記する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
