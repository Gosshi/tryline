# feat-h2h-latest-match-cta: H2Hページに最新試合レビュー・次回対戦の導線を追加

## 背景

2026-07-21、GA4実測でGoogleオーガニック経由のH2Hページ（`/h2h/[pair]`）訪問が平均57秒・1.46ページ/セッションと短時間で離脱する傾向を確認した。現状のH2Hページ（`app/h2h/[pair]/page.tsx`）は「収録対戦リスト」という過去試合の一覧を表示するのみで、訪問者が対戦成績を確認した後に次にどこへ行けばよいかの導線（最新試合のレビューへのCTA、次回対戦の情報）がない。

GPTとの壁打ちで、H2Hページに以下を追加する案が出たが、**「勝敗サマリー（○勝○敗）の表示」は既存spec（`specs/feat-discovery-pages-round-h2h.md`）の明示的な決定と衝突するため対象外とする**。同specには「誇張したH2H戦績（通算◯勝◯敗）を断定しない」と明記されており、Tryline収録分は対戦の全履歴のごく一部に過ぎないため、勝敗数の集計・提示はしない。Owner確認済み。

実コード確認・訂正（2026-07-21レビューで判明）: `HeadToHeadMatch`型（`lib/db/queries/matches.ts:148`）は`MatchListItem`を継承しているが、**`hasPreview`・`hasRecap`は含まれていない**（これらは`CalendarMatch`型のみが持つフィールドで、`HeadToHeadMatch`とは別系統）。コンテンツ状態は`getContentStatusForMatches()`（`lib/db/queries/match-content.ts`、season/teamページで既に使われている関数）を使って別途一括取得する必要がある。`getHeadToHeadMatches()`は`kickoff_at`降順（新しい順）でscheduled/finished両方の試合を返す。

## スコープ

対象:
- `app/h2h/[pair]/page.tsx`のページコンポーネントで、`data.matches.map((m) => m.id)`を使い`getContentStatusForMatches()`を呼び出し、`Record<matchId, MatchContentStatus>`を取得する（既存の`app/teams/[slug]/page.tsx`・season pageと同じパターン）
- 以下2つのセクションを追加する（「収録対戦リスト」セクションの直前が適切と思われるが、配置はCodexの判断でよい）:
  1. **最新試合のレビューCTA**: `data.matches`から`status === "finished"`の最初の要素（配列は既にkickoff_at降順のため、最初に見つかったfinished要素が最新の完了試合）を取得し、スコアを表示。上記で取得したcontent statusマップを引き、`hasRecap === true`の場合のみ`/matches/{id}`への「最新の対戦のレビューを読む」等のCTAリンクを表示する。`hasRecap`が`false`の場合はCTAを表示しない（未生成のレビューへの期待を持たせない）
  2. **次回対戦リンク**: `data.matches`から`status === "scheduled"`かつ`kickoffAt >= 現在時刻`の要素のうち、kickoff_atが最も近いものを1件取得し、存在する場合のみ日時と`/matches/{id}`へのリンクを表示する（`status === "scheduled"`のみだと、何らかの理由でステータス更新が遅れている過去日時の試合を誤って「次回対戦」と表示するリスクがあるため、現在時刻との比較を必須とする）。存在しない場合はセクションごと非表示にする
- 上記2つの新規リンクは`components/tracked-link.tsx`の`TrackedLink`を使い、`cta_id: "h2h_latest_review"` / `cta_id: "h2h_next_match"`、`cta_location: "h2h_page"`、`destination: "match"`、`match_id`を付与してクリックを計測できるようにする

対象外:
- 勝敗数・勝率・優勢チーム・対戦傾向等の集計表示（既存specの決定により対象外）
- 既存の「収録対戦N試合」「直近の対戦」「表示範囲」のMetric行、「全対戦の通算成績ではありません」の注記、収録件数が少ない場合の警告表示 — これらは変更せず維持する
- 「収録対戦リスト」セクション自体の表示ロジック変更（そのまま維持）
- 新規DBクエリの実装（`getContentStatusForMatches`は既存関数の呼び出しであり、新規クエリ関数の追加ではない）

## データモデル変更

なし。

## API サーフェス

なし。

## LLM連携

なし。

## 受け入れ条件

1. `data.matches`に`status === "finished"`の試合が存在し、`getContentStatusForMatches()`の結果でそのうち最新のものが`hasRecap: true`の場合、そのスコアと「レビューを読む」CTA（`/matches/{id}`へのリンク）が表示される
2. 最新の完了試合が`hasRecap: false`の場合、CTAリンクは表示されない（スコアのみ、またはセクション自体を出さない。Codexの実装判断でよい）
3. `data.matches`に`status === "scheduled"`かつ`kickoffAt`が現在時刻以降の試合が存在する場合、そのうち最も近い日時のものが「次回対戦」として日時と`/matches/{id}`へのリンクで表示される
4. 該当する試合が存在しない場合、次回対戦セクションは表示されない
5. 新規リンクは`TrackedLink`を使い、`cta_id`が`h2h_latest_review`・`h2h_next_match`のいずれかで、`match_id`が正しく渡っている
6. 勝敗数・勝率等の集計値がページのどこにも表示されない（既存のMetric行・注記文言は変更されていない）
7. `pnpm tsc --noEmit` / `pnpm lint` / `pnpm test` / `pnpm build` が通る
8. 本番デプロイはOwner承認後に別途行う

## 未解決の質問

なし。
