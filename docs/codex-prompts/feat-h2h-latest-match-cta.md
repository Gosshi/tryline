`/specs/feat-h2h-latest-match-cta.md` の仕様を実装してください。

コンテキスト:
- プロジェクト規約は `AGENTS.md` を読む
- H2Hページ（`app/h2h/[pair]/page.tsx`）は現状「収録対戦リスト」の一覧表示のみで、訪問者が対戦成績を見た後の次の導線がない
- **重要な訂正**: `HeadToHeadMatch`型は`hasPreview`・`hasRecap`を含まない（これらは`CalendarMatch`型のみのフィールド）。コンテンツ状態は`getContentStatusForMatches()`（`lib/db/queries/match-content.ts`）を別途呼んで取得する必要がある
- `data.matches`は`kickoff_at`降順（scheduled/finished両方含む）で返る

やること:
- `data.matches.map((m) => m.id)`で`getContentStatusForMatches()`を呼び、コンテンツ状態のマップを取得する
- `app/h2h/[pair]/page.tsx`に以下2セクションを追加する:
  1. 最新試合のレビューCTA: `data.matches`内で`status === "finished"`の最初の要素（＝最新の完了試合）のスコアを表示し、取得したcontent statusマップで`hasRecap === true`のときのみ`/matches/{id}`への「レビューを読む」CTAを表示する
  2. 次回対戦リンク: `data.matches`内で`status === "scheduled"`かつ`kickoffAt`が現在時刻以降のうち最も近い日時のものが存在すれば、日時と`/matches/{id}`へのリンクを表示する
- 両方のリンクは`components/tracked-link.tsx`の`TrackedLink`を使い、`cta_id: "h2h_latest_review"` / `"h2h_next_match"`、`cta_location: "h2h_page"`、`destination: "match"`、`match_id`を付与する

処理すべきエッジケース:
- 最新完了試合の`hasRecap`が`false`の場合、レビューCTAは表示しない
- `scheduled`かつ未来日時の試合が1件もない場合、次回対戦セクションごと非表示にする
- 収録試合が1件のみ（finishedもscheduledも同じ1件など）の場合でもクラッシュしない

完了の定義:
- specの受け入れ条件1〜8を満たす
- `pnpm test` / `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 変更ファイル一覧を報告する

要件:
- 勝敗数・勝率・優勢チーム等の集計・断定は一切追加しない
- 既存の「収録対戦N試合」「全対戦の通算成績ではありません」等の文言・Metric行は変更しない
- 新規DBクエリは追加しない
- 曖昧な箇所や仕様書と実環境の食い違いがあれば、その場で実装を停止して質問する

完了時:
- 実装内容・変更ファイルを要約する
- 実データ（最新完了試合ありのペア・次回対戦ありのペア・両方ないペア）でのスクリーンショットまたは確認結果を報告に含める
- 仕様書からの逸脱があれば理由を明示する
- 未解決の質問があれば記載する
