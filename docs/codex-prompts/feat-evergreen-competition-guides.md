# Codex プロンプト: エバーグリーン大会ガイド（順位表データ＋視聴方法）

仕様: `specs/feat-evergreen-competition-guides.md` を参照（インライン展開しない）。

集客SEO施策。**Part A → Part B の順で段階リリース**（A は既存資産の配線だけで速攻の SEO 受け皿になる）。

## Part A（先行・データ）: ライブ大会の順位表取り込み

現状: シーズンページ `app/c/[competition]/[season]/page.tsx` は `StandingsTable` ＋ `getStandingsForCompetition` で順位表を**表示する実装が既にある**が、`competition_standings` が全大会0行（`p1-competition-standings` は Six Nations 2027 fixtures 末尾でのみ取り込んでいる）。

タスク:
1. なぜライブ大会の standings が空かをトレース（`lib/ingestion/standings.ts` / `wikipedia-standings.ts` の呼び出し箇所を確認）
2. **進行中・直近シーズンの主要大会**（super-rugby-pacific / premiership / urc / top-14 / league-one / rugby-championship / six-nations / pnc / autumn-nations）の順位表を取り込む導線を追加:
   - 既存 `wikipedia-standings.ts`（Wikipedia の順位表テーブルをパース）＋ `lib/ingestion/standings.ts`（upsert）を再利用
   - `ingest-live-competitions`（`lib/ingestion/live-competitions.ts`）に相乗り、または専用バックフィルスクリプト `scripts/backfill-standings.ts`（`--family`/`--season`/`--dry-run`/`--confirm-owner-approved`）を新設
   - upsert は **competition_id × team_id で冪等**（再実行で重複しない）
3. ソースは Wikipedia のみ・`fetchWithPolicy`（robots 準拠）

受け入れ: dry-run で対象大会の順位表行数が出る → 本実行後、`/c/[competition]/[season]` の `#standings` に実データが表示（例: URC 2025-26）。本番取り込みは Owner 実行（`--confirm-owner-approved`）。

## Part B（本命・コンテンツ）: 視聴方法 section

1. マイグレーション: `competitions` に `viewing_guide_ja text null`（markdown）追加。`pnpm supabase:types` 再生成
2. `getCompetition*` 系クエリに `viewing_guide_ja` を含める
3. `/c/[competition]` と `/c/[competition]/[season]` に「**日本での視聴方法**」section を追加:
   - `viewing_guide_ja` があれば markdown レンダリングで表示、無ければ section 自体を非表示
   - 既存の見出しスタイル（`font-heading`・`#standings` 等の既存セクション）に合わせる
4. SEO メタデータ更新:
   - title 例「URC 2025-26 順位表・試合結果・日本語レビュー｜Tryline」
   - description に「日本での視聴方法」を含める
   - 既存の構造化データ・OG は回帰させない

内容（`viewing_guide_ja` の中身）は **Owner が記述**するので、Codex は**空でも壊れない**ことを保証（編集 UI は不要、直 SQL 運用前提）。

## 受け入れ条件（完了の定義）
- ビルド・typecheck・lint・既存テスト緑
- Part A: 主要ライブ大会で `competition_standings` に行が入り `#standings` に表示（冪等・Wikipedia源）
- Part B: `viewing_guide_ja` 有→section表示／無→非表示で崩れない
- 大会ページ title/description に「順位表」「視聴方法」が入る
- 既存の結果・recap リンク・構造化データが回帰しない

## 注意
- 本番取り込み・viewing_guide_ja の記入は Owner。Codex は実装＋テスト＋（必要なら）バックフィルスクリプトまで
- 段階リリース可（Part A の PR を先に出し、Part B を別 PR でも良い）

## 参考パターン
- 順位表表示: `components/standings-table.tsx`・`lib/db/queries/standings.ts`・`app/c/[competition]/[season]/page.tsx` の `#standings`
- 既存 standings 取り込み: `lib/ingestion/standings.ts`・`lib/scrapers/wikipedia-standings.ts`・`ingestSixNations2027Fixtures`
- ライブ取り込み: `lib/ingestion/live-competitions.ts` / `lib/ingestion/live-ingest.ts`
