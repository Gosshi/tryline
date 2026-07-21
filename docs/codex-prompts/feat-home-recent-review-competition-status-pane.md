`/specs/feat-home-recent-review-competition-status-pane.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- `fix-home-recent-review-single-group-gap.md`（PR #621、マージ済み）で「最近のレビュー」セクションの単独グループを`xl:col-span-2`で全幅表示するようにしたが、中身の情報密度が上がらず間延びして見える問題が残っている（Owner実機確認・スクリーンショットあり）
- GPT-5.6との検討（2026-07-21）を経て、右側に「大会の現在地」（順位表抜粋＋次戦）を出す方針で合意済み。ニュースitem案は`match_sourced_facts.fact_ja`が未整備のため不採用と判断済み

やること:
- `app/page.tsx`の「最近のレビュー」セクションで、`recentReviewGroups.length === 1`のときのみ、カードを左右2ペインに再構成する
  - 左ペイン: 既存のヒーローレビュー＋同節簡易リスト（変更なし）
  - 右ペイン: `getStandingsForCompetition(group.competition.slug)`の結果を`<StandingsTable>`（`components/standings-table.tsx`）に`highlightedTeams`＝ヒーロー試合の両チーム名、小さめの`excerptThreshold`で渡して表示 ＋ `getNextMatchForCompetition({family, season})`の次戦情報 ＋ 大会ハブページへのリンク（`/c/${family}/${season}`）
- `recentReviewGroups.length === 1`のときのみ、上記2クエリを`Promise.all`で追加取得する（複数件時は取得しない）

処理すべきエッジケース:
- 次戦情報がない場合、次戦ブロックだけ非表示にし順位表は表示する
- 順位表・次戦のどちらも取得できない場合、右ペイン全体を表示せず、現状の全幅単一カード表示にフォールバックする（空のペインを作らない）
- 375px幅では2ペインをやめ、縦積みにする

完了の定義:
- specの受け入れ条件1〜8を満たす（8番目のOwner目視確認は、実装後にスクリーンショットを添えて報告し、Owner確認を待つ形でよい）
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- `getPoolStandingsForCompetition`（プール制大会向け）は使わない。`app/matches/[id]/page.tsx`が`getStandingsForCompetition`のみを使う既存パターンに倣う
- 順位表示ロジックを新規実装しない。既存の`<StandingsTable>`の`highlightedTeams`・`excerptThreshold`をそのまま使う
- ニュースitem・試合後アップデートは対象外
- 大会ヒーロー画像・Premium CTA・お気に入りチームCTAの新規配置は対象外
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 1920px・1440px・375pxのスクリーンショット（`recentReviewGroups`が1件の状態で右ペインが表示されているもの、可能なら2件以上時に従来通りであることも）を添付する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
