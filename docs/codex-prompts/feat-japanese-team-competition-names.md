# Codex プロンプト: 海外チーム・大会の日本語（カタカナ）表示名

## 仕様書

`specs/feat-japanese-team-competition-names.md` を読んで実装してください。
背景の根拠は `docs/seo-japanese-query-diagnosis-2026-06.md`（海外チーム/大会名が英語のままで日本語検索に当たらない）。

## このタスクの分担（重要）

- **Codex が実装するもの**: スキーマ追加（`name_ja`）、表示名の解決ロジック、日本語ページ・ナラティブプロンプトへの配線、テスト、**確定マッピングの投入**。
- **カタカナ表記は確定済み**: `docs/team-competition-katakana-mapping.md` に海外チーム78件＋大会の `slug → name_ja` が出典付きで確定している。**Codex はこのマッピングをそのまま投入**する（音訳・推測は禁止）。⚠ 印の7件のみ Owner 確認待ちだが、表のデフォルト値で投入してよい（後で追補修正可能）。

## 実装ステップ

### 1. スキーマ（マイグレーション）
- `teams` に `name_ja text`（nullable）追加
- `competitions` に `name_ja text`（nullable）追加
- 既存 `name` / `english_name` は変更しない（非破壊）
- マイグレーションは `supabase/migrations/` に追加。**Owner が適用**するので、適用コマンドは実行しない。

### 2. 表示名の解決ロジック
- 日本語表示名 = `name_ja ?? name`（カタカナ優先・英語フォールバック）
- `lib/format/competition.ts` の `formatCompetitionName`（現状リーグワンのみ日本語化）を、`name_ja` ベースの解決に拡張。シーズン表記（2026 / 2025-26）は従来どおり整形側で付与し `name_ja` には含めない。
- チーム表示名のヘルパも同様に用意（例: `getTeamDisplayName(team, "ja")`）。

### 3. クエリ・型
- `lib/db/queries/`（`getMatch` 等、チーム/大会を返すクエリ）の select に `name_ja` を追加
- チーム/大会の型に `nameJa?: string | null` を追加

### 4. 日本語ページへの適用（英語ページ `/en` は対象外）
- `app/matches/[id]/page.tsx`: `generateMetadata` の title（L81）・description・h1・`SportsEvent`/`NewsArticle` JSON-LD のチーム/大会名を日本語表示名に
- シーズン/大会ページ・パンくず・内部リンクのチーム/大会名表示
- 期待例: 「チーフス vs クルセイダーズ — スーパーラグビー パシフィック 2026」

### 5. ナラティブ/プレビュー生成プロンプト
- 生成プロンプト（ナラティブ・プレビュー段階）に「チーム名・大会名はカタカナ表記」を指示し、対象試合の `name_ja` から動的にカタカナ用語集を組んで渡す
- `name_ja` が無いチームは英語名のまま（フォールバック）

### 6. データ投入（確定マッピングを使用）
- `docs/team-competition-katakana-mapping.md` の `slug → name_ja`（海外チーム78件＋大会 family）をマイグレーションで投入。
- リーグワン日本チームは `name_ja = name` を投入。
- 投入後の検証クエリ: `SELECT count(*) FROM teams WHERE name_ja IS NULL AND name !~ '[ぁ-んァ-ヶー一-龠]'` が **0件**（海外チームの取りこぼしなし）。大会も同様に海外 family の `name_ja` が埋まっていること。
- マッピングに slug が無いチームが出たら（データ追加等）、PR 説明に列挙して Owner に報告。

## 出典（カタカナ）
WOWOW / J SPORTS の日本語表記、Wikipedia 日本語版の定着表記。Six Nations・Rugby Championship の代表は国名なので既存の日本語国名表記と整合（イングランド代表 等）。

## エッジケース
- `name_ja` NULL のチーム/大会は英語フォールバックで描画が壊れないこと
- 英語ページ `/matches/[id]/en` は英語名のまま（リグレッションさせない）
- ミドルドット表記ゆれ（「クイーンズランド・レッズ」）は seed の表記に統一

## 完了条件
- `teams.name_ja` / `competitions.name_ja` 追加のマイグレーションが存在（未適用でよい）
- 解決ロジック `name_ja ?? name` のユニットテスト（`tests/lib/format` 等）
- seed 11件＋リーグワン日本チームに `name_ja` 投入、残りは要記入リスト出力
- `/matches/<海外試合>`（ja）の title/h1/meta/JSON-LD がカタカナ表示（seed 投入済みチームで確認）
- 英語ページ `/en` は英語名のまま不変
- 新規生成 recap/preview がカタカナ team/大会名を使う（生成テスト）
- 既存テスト緑、`pnpm tsc --noEmit` / `pnpm lint` / `pnpm build` clean

## 依存
本タスク着手前に `feat-utm-attribution.md`（計測の土台）を先行マージ推奨。UTM が入っていれば、カタカナ化後の SEO 流入を GA4 で効果測定できる。
