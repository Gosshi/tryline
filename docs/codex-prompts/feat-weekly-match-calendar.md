# Codex プロンプト: 今週の試合カレンダー（全大会横断・解説リンク付き）

仕様: specs/feat-weekly-match-calendar.md を参照（内容はインライン展開しない）。

## タスク
全大会横断の「今週の試合」カレンダーを追加する。トップに「今週の試合」セクション、独立ページ `/calendar` を新設し、各試合から `/matches/[id]` へリンクする。データ・生成パイプラインは変更せず、参照とUIのみ。

## 変更ファイルと内容

### 1) lib/db/queries/matches.ts — 新規 getMatchesInRange
- `getMatchesInRange(startUtcIso: string, endUtcIso: string)` を追加。
- `getUpcomingMatches`（L747付近）の select（teams＋competition join）を流用。ただし **status でフィルタしない**。`kickoff_at` を `>= start` かつ `< end`、昇順。
- 各試合に `hasContent: boolean` を付与（ja の published `match_content` が preview か recap で存在）。`match_content` の join か、`listMatchIdsWithContent` 相当の集合と突き合わせ。
- 戻り型は `UpcomingMatch`（`MatchListItem & { competition }`）に `hasContent` を加えた新型（例 `CalendarMatch`）。

### 2) lib/format/ — 週レンジ算出ヘルパ（新規 or kickoff.ts に追加）
- 現在時刻を JST で解釈し、**月曜 00:00 JST 〜 翌月曜 00:00 JST** を求め、両端を UTC ISO で返す純粋関数（例 `getCurrentJstWeekRangeUtc(now = new Date())`）。テスト容易性のため `now` を引数で受ける。

### 3) components/calendar/ — 共有表示コンポーネント
- 曜日(JST)ごとにグルーピングして表示する `WeekSchedule`（＋必要なら `DaySection` / `MatchRow`）。
- 時刻は lib/format/kickoff.ts の JST フォーマッタを使用（独自実装しない）。
- 状態表示: scheduled=キックオフ時刻 / in_progress=ライブ表示 / finished=スコア（lib/format/status.ts を利用）。
- `hasContent` が真なら控えめな「解説」バッジ。**未生成でも `/matches/[id]` リンクは常に張る**。

### 4) app/calendar/page.tsx — 独立ページ
- RSC。`getCurrentJstWeekRangeUtc()` → `getMatchesInRange()` → `WeekSchedule`。
- `export const revalidate = 1800;`
- `generateMetadata`（title/description/canonical = `${SITE_URL}/calendar`）。
- 空週はフレンドリーな空状態。

### 5) app/page.tsx — トップに「今週の試合」セクション追加
- 同じ週レンジ＋`WeekSchedule`（または要約表示）。今日以降の直近数件＋「今週をすべて見る」で `/calendar` へ。
- 既存セクション構成・スタイルに合わせる。

### 6) ヘッダーナビ & sitemap
- ヘッダーに `/calendar` への導線を1つ追加。
- sitemap に `/calendar` を追加。

## 受け入れ条件（完了の定義）
- 現在の JST 週の全大会の試合が曜日ごと・キックオフ昇順で表示
- 時刻は JST、各試合は `/matches/[id]` へリンク、状態別表示（予定/開催中/終了スコア）
- 試合ゼロの週は空状態（エラーにしない）
- `getMatchesInRange` と週レンジ算出の単体テスト（JST 週境界の内外、status 混在、`hasContent` 判定）
- `/calendar` がメタデータ保持・sitemap に含まれる、トップに「今週の試合」セクション描画
- pnpm tsc --noEmit / pnpm lint / pnpm build clean

## 参考パターン
- 取得: getUpcomingMatches / getFavoriteTeamMatches（同ファイル、join と mapMatchRow の使い方）
- 時刻: lib/format/kickoff.ts（formatKickoffJst / formatKickoffJstDate）
- 状態: lib/format/status.ts
- 既存のトップ各セクション（app/page.tsx）と大会別ページ（app/competitions/[slug]）の見せ方

## エッジケース
- 週またぎ（土日深夜キックオフ＝UTCでは翌日）の JST 日付グルーピングが正しいこと
- competition が null の行は除外（getUpcomingMatches と同様）
- 同一時刻に複数試合 → 大会名・カード名で安定ソート

## スコープ外（やらない）
- 前後週ページャ / broadcast_jp_url 併記 / フィルタ / .ics / 月グリッドUI（v1 対象外）
