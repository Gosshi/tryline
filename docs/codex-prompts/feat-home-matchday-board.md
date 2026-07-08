`/specs/feat-home-matchday-board.md` の仕様を実装してください。

**着手前の前提確認（重要）:**
- PR #497（`codex/feat-home-multi-competition-featured-reviews`）がマージ済みであること。未マージなら着手せずその旨を報告する
- `specs/feat-calendar-week-navigation.md` の実装（状態ピル分解 `hasPreview`/`hasRecap`・注目試合選定ユーティリティ）がマージ済みであること。本 spec はそれに依存する

コンテキスト:
- プロジェクト規約は `CLAUDE.md` を読む
- 基準ビジュアルは `docs/design/mock-growth-home-calendar.html` の `.matchday-panel`（ヒーロー右ボード）、`.focus-card`（注目大会カード）、`.sample-box`（チャット質問例）を参照する
- ただし spec の「採用しない」節に注意: モック内の GSC クリック数等の内部指標・SEO 文言は**絶対に UI に出さない**。統計 3 枠は spec 指定の DB 由来の値（次戦 JST・公開済みレビュー数・今週の試合数）に差し替える
- チームカラーグラデーションの既存パターンは `components/match-card.tsx:36`（`getTeamColor(slug)` の低透過 2 色グラデーション）、バッジは `components/team-badge.tsx`
- ヒーローの現行実装は `app/page.tsx:175-264`、「今週の試合」帯は `app/page.tsx:364-387`、サンプルセクションは `app/page.tsx:270-330`（PR #497 マージ後は行番号がずれる可能性あり。セクション構造で特定する）
- 計測リンクのパターンは既存の `TrackedLink` 使用箇所（`app/page.tsx` 内に多数）に従う

入出力の例:
- 今週に試合 5 件（うち日本代表戦 1 件）→ board の注目試合 = 日本代表戦、クイックリスト = 残りから 3 件、フッターに「ほか 1 試合 →」（`/calendar` リンク）
- 今週に試合 2 件（日本代表戦なし・両チーム world_ranking あり）→ 注目試合 = ランキング合計最小の 1 件、クイックリスト = 残り 1 件
- 今週に試合 0 件 → board を描画せず、ヒーローは単カラム
- 順位・ランキングどちらも無い注目試合 → メトリクスは「キックオフ JST」「コンテンツ状態」の 2 枠のみ

処理すべきエッジケース:
- チーム名が長い場合（クラブチームの長い名称）に board 内で折り返し・truncate が破綻しないこと
- `homepageWeekMatches` が既にホームで取得済みのデータであること（board のために同じクエリを 2 回発行しない）
- ヒーロー h1 の語中改行: 375px 幅で「ラグビ／ー」のような分離が起きないこと（`break-keep` + 手動改行制御）
- Premium ユーザー表示時（`profile?.subscription_status === "premium"` で CTA が消える分岐）でもレイアウトが崩れないこと
- 旧ヒーローサンプルカード（`cta_id: home_hero_sample_recap`）の削除に伴い、未使用になる変数・import を残さないこと

完了の定義:
- specs の受け入れ条件 1〜12 をすべて満たす
- `tests/app/home-page.test.tsx` を更新し `pnpm test` が通る
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean
- 320 / 375 / 768 / 1440px のスクリーンショットを提示する（試合あり週の状態で）

要件:
- 「スコープ対象外」（最近のレビュー節・大会アーカイブ・`/calendar`・メール登録・6N/RWC ハブカード・ヒーロー背景変更）は実装しない
- 既存 analytics の `cta_id` / `cta_location` を変更しない（新設の `home_featured_competition` を除く）
- 曖昧な箇所があれば末尾に質問として列挙する。推測しない

完了時:
- 実装内容、変更ファイルを要約する
- 仕様書からの逸脱があれば理由を明示する
- Owner への未解決の質問があれば記載する
