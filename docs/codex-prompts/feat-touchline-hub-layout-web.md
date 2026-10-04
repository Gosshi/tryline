# Codex 指示書: デザイン刷新 第2弾（Web）— 大会シーズンページで日程と順位を 1 画面目に出す

仕様書: `specs/feat-touchline-hub-layout-web.md`
決定: `docs/decisions.md` の D037
基準ビジュアル: `docs/notes/gpt-web-redesign-2026-10-03/mock-a4.html` の「Web 大会」タブ
受け入れ条件は仕様書を正とする。ここでは繰り返さない。

`AGENTS.md` の規約に従う。仕様書と実コードが食い違ったら（行番号のずれ以上の違い）、実装を進めずその場で止めて Owner に確認する。**最新の `origin/main` からブランチを切る。**

## やること

`app/c/[competition]/[season]/page.tsx` の並び順と配置だけを変える。

1. ヒーロー: 高さを `min-h-40 sm:min-h-44` に。写真にかける色を墨色のグラデーション（仕様書の値）に。`sm` 以上で首位・進行を帯の中の右側へ。帯の下の白い箱を削除。
2. カレンダーのリンク（`CompetitionCalendarLinks` と「今週の全試合を見る」）を帯の直下に、白い箱なしの 1 行で。`cta_id` / `cta_location` は変えない。
3. 並び順: 帯 → カレンダーのリンク → `SeasonSwitcher` → ページ内ナビ → `JapanMatchesBlock` → 日程と順位表 → `SeasonSummaryBand` → `IosAppCta` → `NewsletterSignup` → ガイド。
4. 日程と順位表: `hasStandings` のとき `lg` 以上で 2 列のグリッド。右列（`#standings`）は sticky、高さが画面を超えるときは列の中でスクロール。`hasStandings` が false なら日程を全幅。
5. ページ内ナビを下線のタブに。`lg` 以上では「順位」のタブを隠す。
6. テスト: 並び順の assert の書き換えと、仕様書の受け入れ条件 10 の 2 本の追加。

## 触るファイル

- `app/c/[competition]/[season]/page.tsx`
- `tests/app/season-page-ia.test.tsx`（必要なら `tests/app/competition-guide-metadata.test.ts`）

## 守ること

- 仕様書の「対象外」に挙げた部品（`components/` の 8 ファイル）は変更しない。
- `h1` の文言、JSON-LD、`generateMetadata`、`revalidate`、データの取得は変えない。
- `#schedule` / `#standings` / `#guide` の `id` と `scroll-mt-4` は残す。
- 日程の試合リンクがサーバーの HTML に出る状態（#749）を壊さない。`SeasonMatchGroups` を client 側でしか描かれない場所に移さない。
- 動き（アニメーション）は入れない。
- 既存のテストは消さない。落ちる assert は新しい期待値に書き換え、PR 本文に一覧を書く。

## 処理すべきエッジケース

1. 順位表が無い大会（`hasStandings` が false、例: `/c/pnc/2026`）: 2 列にしない。ナビの「順位」タブも今どおり出ない。
2. 開幕前（`seasonNotStarted`、例: `/c/six-nations/2027`）: 右列は「参加チーム」（`PoolTeamGrid`）。「順位表をすべて見る →」は今どおり出さない。
3. プール別の順位表（例: `/c/nations-championship/2026`）: 右列に複数の表が縦に並ぶ。画面より高いときに列の中でスクロールできること。
4. 試合が 0 件（空の状態の箱）: 左列に今の空の状態の箱がそのまま出る。
5. 首位も進行も無い大会: 帯の中・下に何も出さない（今と同じ条件）。
6. 日本代表の試合がない大会: `JapanMatchesBlock` は今どおり何も描かない（`return null`）。

## 検証

- `pnpm tsc --noEmit`・`pnpm lint`・`pnpm test`・`pnpm build` を実行する。**すべて必ず実行し、結果を完了報告に含める。**
- 仕様書の「測り方」で 1 画面目の位置を測り、本番の値と並べた表を PR 本文に貼る。
- 受け入れ条件 5 の `curl` の結果（生の HTML の試合リンクの数）を PR 本文に貼る。プレビューが保護されていて取れない場合はそう書く。
- 受け入れ条件 8 の `git diff --stat origin/main` を PR 本文に貼る。
- 仕様書の 5 ページのスクリーンショット（1440×900 / 390×844）を PR 本文に貼る。プレビューにアクセスできない場合はそう書けばよい（Claude Code が Owner のブラウザで撮る）。
- 「壊して落ちる」確認（コミットしない）: 受け入れ条件 11。失敗の出力を PR 本文に貼る。

## 完了の定義

- PR が作成され、上の検証結果・測定の表・スクリーンショットが PR 本文にある。
- マージは Owner がスクリーンショットを見て判断する。
