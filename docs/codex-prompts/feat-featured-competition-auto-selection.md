`/specs/feat-featured-competition-auto-selection.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- `lib/featured-competition.ts`の`FEATURED_COMPETITION`は2026-07-11に手動でNations Championship 2026に切り替えられたハードコード定数。同時の仕様書で「恒久的な自動選択の仕組みは別spec予定」と明記されており、本specがそれに当たる
- **重要な訂正**: `TeamDetail`型（`getTeamBySlug`の返り値）はチームIDを含まない。`getNextMatchesForTeams`の返り値は`{teamId, match}[]`で試合そのものではない。この2点を踏まえ、新規共通ヘルパー`getNextMatchForTeamSlug(teamSlug, afterIso)`を実装する
- `feat-competition-hub-post-tournament-navigation.md`でも同じヘルパーが必要になる。重複実装を避けるため、`lib/db/queries/matches.ts`にexportされた1つの関数として実装する

やること:
- `lib/db/queries/matches.ts`に`getNextMatchForTeamSlug(teamSlug: string, afterIso: string): Promise<UpcomingMatch | null>`を新規実装する。非公開関数`getHeadToHeadTeamBySlug`（`id, slug, name, short_code`を取得するteamsクエリ）と同様のパターンでチームIDを解決し、そのIDで直近の未来の試合を1件取得する。チームが見つからない場合は`null`を返す
- `lib/featured-competition.ts`の`FEATURED_COMPETITION`静的定数を、非同期関数`getFeaturedCompetition(now: Date = new Date()): Promise<FeaturedCompetition>`に置き換える:
  1. `getNextMatchForTeamSlug("japan", now.toISOString())`を呼ぶ
  2. 取得できればその`competition.family`・`competition.season`を採用し、`headline`・`description`を対戦カード・大会名から動的生成する
  3. 取得できない場合のみ、現行のNations Championship 2026の値をフォールバックとして返す
- `app/page.tsx`で`FEATURED_COMPETITION`の静的importを`await getFeaturedCompetition()`呼び出しに置き換える。以下の**すべての参照箇所**を動的な値に置き換える:
  - `FeaturedCompetitionCard`へのprops
  - `isFeaturedCompetitionMatch`フィルタ関数
  - `getNextMatchForCompetition({family, season})`呼び出し
  - `featuredCompetitionMatches`フィルタ
- `components/featured-competition-card.tsx`を、`FEATURED_COMPETITION`を直接importする実装から`family`・`season`・`headline`・`description`をpropsで受け取る実装に変更する

処理すべきエッジケース:
- 日本代表の未来の試合が1件もない異常系でクラッシュせず、フォールバック値を返す
- 大会画像（`getCompetitionHeroImage`）に専用画像がない大会（例: リポビタンDチャレンジカップ）でも表示が破綻しない
- テストは`now`引数に固定の`Date`を渡し、現在時刻に依存しない形で書く

完了の定義:
- specの受け入れ条件1〜9を満たす（9番目のOwner目視確認は、実装後にスクリーンショットを添えて報告し、Owner確認を待つ形でよい）
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- 日本代表戦以外の選定基準は実装しない
- キャッシュ・revalidateタイミングの変更はしない
- `getNextMatchForTeamSlug`は`lib/db/queries/matches.ts`から必ずexportし、他specから再利用できる状態にする
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- テストで固定の`now`を渡した際にリポビタンDチャレンジカップ2026が選ばれることを確認した結果を報告に含める
- ホームページのスクリーンショットを添付する
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
