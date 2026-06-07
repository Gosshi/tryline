# 今週の試合カレンダー（全大会横断・解説リンク付き）

## 背景

対象ユーザーは「週3〜10試合の海外戦を日本語で追う」層（[[project_target_audience]]）で、「今週どの試合がいつあるか／どこに解説があるか」が最も欲しい情報。現状は大会別ページ（`/competitions/[slug]`）とトップの「近日開催」5件程度しかなく、**全大会を横断した週次の俯瞰がない**。

試合中心データモデル（`matches` に `kickoff_at`・大会・各試合ページ）が既にあるため、横断カレンダーは薄い追加で実現でき、回遊・再訪の背骨になる。各試合ページへの内部リンクを配ることで、薄い選手ページに偏ったインデックス構造の是正にも逆方向で効く（[[project_index_bloat]]）。

## スコープ（v1）

対象:
- **トップに「今週の試合」セクション**を追加
- **独立ページ `/calendar`**（今週固定、全大会横断）
- 表示: JST の曜日ごとにグルーピング → 各試合は キックオフ時刻(JST)・大会・対戦カード・状態（予定/開催中/終了＋スコア）
- 各試合セルは `/matches/[id]` へリンク（解説/プレビュー/レビューの試合ページ）

対象外（後日）:
- 前後週のページャ（v1 は「今週」固定）
- 放送導線 `broadcast_jp_url` の併記（データ整備後の次段）
- お気に入りチーム/大会フィルタ、カレンダー(.ics)エクスポート
- 月表示などのカレンダーグリッドUI（v1 は曜日見出し＋リストで十分）

## データモデル変更

なし（`matches`・`match_content` の既存スキーマを参照のみ）。

## API サーフェス

新規ページ `/calendar`（RSC、`revalidate` は 1800 秒目安＝スコア反映と鮮度の妥協）。クライアント API は追加しない。

データ層（`lib/db/queries/matches.ts`）に関数を1つ追加:
- `getMatchesInRange(startUtcIso: string, endUtcIso: string)` — `kickoff_at` が範囲内の試合を、`getUpcomingMatches` と同じ teams＋competition join で取得（**status でフィルタしない**＝予定/開催中/終了すべて含む）、`kickoff_at` 昇順。
- 各試合に `hasContent: boolean`（ja の published `match_content` が preview か recap で存在するか）を付与。`match_content` の left join か、`listMatchIdsWithContent` 相当の集合との突き合わせで判定。
- 戻り型は `UpcomingMatch`（`MatchListItem & { competition }`）に `hasContent` を加えた形を再利用。

「今週」の算出:
- 現在時刻を **JST** で解釈し、**月曜 00:00 JST 〜 翌月曜 00:00 JST** を週とする。両端を UTC に変換して `getMatchesInRange` に渡す。
- 週の定義（月〜日）と JST 固定は本プロダクトが日本向けのため不変条件。

## UI サーフェス

- `app/calendar/page.tsx` — 今週の全試合を曜日ごとに表示。空週はフレンドリーな空状態。
- `app/page.tsx` — 「今週の試合」セクションを追加（同じ共有コンポーネントを使用、トップでは件数や高さを抑えた要約表示でも可）。
- `components/calendar/` に共有コンポーネント（例: `WeekSchedule` / `DaySection` / `MatchRow`）。
- 時刻表示は `lib/format/kickoff.ts` の JST フォーマッタを使う（独自実装しない）。
- ヘッダーナビに `/calendar` への導線を1つ追加。
- 状態表示: scheduled=キックオフ時刻、in_progress=ライブ表示、finished=スコア（`lib/format/status.ts` 既存ユーティリティを利用）。
- `hasContent` が真なら控えめな「解説」バッジを付ける。**未生成でも試合ページへのリンクは常に張る**（試合情報・スタメン等は出るため）。

## LLM 連携

なし（生成パイプライン非依存。既存コンテンツへのナビゲーションのみ）。

## SEO

- `/calendar` を sitemap に追加し、トップ／ヘッダーから内部リンク。
- メタデータ（title/description/canonical）を付与。
- 各試合ページ（良質ページ）への内部リンクを増やす効果を意図。

## 受け入れ条件

- 現在の JST 週（月〜日）の全大会の試合が、曜日ごとにキックオフ昇順で表示される
- 時刻は JST 表記（`formatKickoffJst*` を使用）
- 各試合セルが `/matches/[id]` へリンクする
- 状態別表示: 予定=時刻 / 開催中=ライブ / 終了=スコア
- 試合のない週は空状態を表示（エラーにしない）
- `getMatchesInRange` の単体テスト: JST 週境界（月曜0時の内外）・status 混在・`hasContent` 判定
- `/calendar` がメタデータを持ち、sitemap に含まれる
- トップの「今週の試合」セクションが描画される
- `pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean

## 未解決の質問

- 週の起点は月曜で確定（ラグビーは週末集中だが、月曜起点で週末を1ブロックに収められる）。土曜起点が良ければ要相談。
- トップのセクションは全件か件数制限か（推奨: 今日以降の直近 N 件＋「今週をすべて見る」で `/calendar` へ）。
