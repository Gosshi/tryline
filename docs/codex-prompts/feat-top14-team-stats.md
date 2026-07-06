# Codex プロンプト: Top14 公式サイトからのチームスタッツ取り込み

仕様: `specs/feat-top14-team-stats.md` を参照（テーブル定義・スクレイピング方針・LLM連携の詳細はすべて仕様書に記載）。

## タスク

Top14公式サイト（top14.lnr.fr）の試合スタッツページから、ポゼッション率・テリトリー率・ラインアウト/スクラム成功数・タックル数・キャリー数等（第3層データ）を取得し、`match_team_stats` テーブルに保存、recap生成プロンプトとQAプロンプトに注入する。**対象はTop14のみ**（他大会は対象外。JSレンダリング必須で技術投資が別途必要なため）。

## 実装順序

1. **事前調査（最優先・これをスキップしない）**: `https://top14.lnr.fr/feuille-de-match/2025-2026/j24/11469-lyon-bayonne/statistiques-du-match` のようなURLに含まれる数値ID（`11469`）を、Tryline内部の試合データから解決する方法を確認する。`top14.lnr.fr` に試合結果一覧ページ（`/calendrier-resultats/{season}/j{round}` 等）が存在し、そこから全試合の数値IDを一括取得できるか実際にfetchして確認すること。確認結果を `specs/feat-top14-team-stats.md` の「事前調査」節に追記してから次に進む
2. **DBマイグレーション** — `match_team_stats` テーブル新規作成（仕様書のSQL定義どおり）。`matches.external_ids` に `top14_lnr_id` フィールドを追加（既存の `wikipedia_url` 等と同じ `external_ids` jsonbカラムに追加するだけで、新規カラムは不要）
3. **`lib/scrapers/top14-match-stats.ts`（新規）** — `fetchWithPolicy`（`lib/scrapers/fetcher.ts`）で試合スタッツページを取得し、`cheerio` でDOM解析。抽出フィールドは仕様書のテーブル定義と一致させる。パーセンテージは0-100、カウント系は非負整数であることを検証し、範囲外は該当行を保存せず警告ログを出す
4. **`scripts/backfill-top14-team-stats.ts`（新規）** — `--dry-run` 対応のCLI。対象: `competition.family = 'top-14'` かつ `status = 'finished'` の試合。`external_ids.top14_lnr_id` が未設定の試合は名寄せ（手順1で確定した方式）を先に行ってから取得
5. **`lib/llm/types.ts`** — `AssembledContentInput` に `team_stats: { home: Top14TeamStats | null; away: Top14TeamStats | null } | null` を追加
6. **`lib/llm/stages/assemble.ts`** — `match_team_stats` を home/away 2行取得し `team_stats` を組み立てる。Top14以外の大会・データ未取得試合では `null`
7. **`lib/llm/prompts/generate-recap.ts`** — `PROMPT_VERSION` を `"recap@4.11.0"` → `"recap@4.12.0"` にバンプ。`team_stats` ブロックを `derived_stats` ブロックの隣に追加。文言: 「以下は公式サイトから取得した実際のチームスタッツです。ポゼッション率・成功率等の数値表現をそのまま使ってよい」（`derived_stats` と異なり**パーセント表記を許可**する点に注意）
8. **`lib/content/fabrication-guard.ts` は変更しない** — `containsUnsupportedStatistic` 自体は無改修。代わりに新規ヘルパー `buildTeamStatsFactStrings(teamStats)` を `lib/llm/stages/qa.ts`（または適切な場所）に追加し、team_stats から `"ホームチームのポゼッション率58%"` のような事実文字列を生成する
9. **`lib/llm/stages/qa.ts:139-141`** — `containsUnsupportedStatistic` に渡す第2引数を `[...(matchContext.sourcedFacts?.map((fact) => fact.fact) ?? []), ...buildTeamStatsFactStrings(matchContext.teamStats)]` に変更
10. **`lib/llm/prompts/qa-content.ts`** — `PROMPT_VERSION` を `"qa@2.2.0"` → `"qa@2.3.0"` にバンプ。`QaMatchContext` に `teamStats?: Top14TeamStats | null` 追加。`sourcedFactsBlock` と同様の位置に teamStats グラウンディングブロックを追加（文言は `derived_stats` grounding ブロックと同趣旨: 「以下は公式サイトから取得した実データです。本文がこれらの数値に言及している場合、factual_grounding を下げないこと」）
11. **`lib/llm/pipeline.ts`** — QA呼び出し2箇所（`sourcedFacts: assembled.sourced_facts` の隣、`feat-derived-match-stats.md` 実装時にL245・L368付近だったが現在の行番号を確認）に `teamStats: assembled.team_stats` を追加
12. **テスト** — 下記

## エッジケース（必ずテストすること）

- team_stats が存在しない試合（Top14以外、または未取得）: `assembled.team_stats === null`、プロンプトにブロックが入らない
- パーセンテージが100を超える・負の値など異常値: 保存せず警告ログ、該当フィールドは欠落として扱う（試合自体は他フィールドがあれば保存）
- `top14_lnr_id` が名寄せできない試合: スキップしてログに残す（例外で全体を止めない。`fill-event-gaps.ts` と同じ作法）
- `containsUnsupportedStatistic` のテスト: team_stats由来のfact文字列がある場合、本文の「ポゼッション58%」等の記述がブロックされないことを確認する回帰テストを追加

## テスト

- 新規 `tests/scrapers/top14-match-stats.test.ts`: サンプルHTML（実ページの構造を模したfixture）から全フィールドが正しく抽出されること、異常値（101%等）が除外されることを確認
- 新規 `tests/llm/stages/qa.test.ts`（既存があれば追記）: `buildTeamStatsFactStrings` が生成した文字列で `containsUnsupportedStatistic` がfalseを返すことを確認
- `tests/llm/prompts/generate-recap.test.ts`: team_stats ありでプロンプトに「チームスタッツ」ブロックが含まれる、`null` の場合ブロックが含まれないことを追加
- 既存バージョン文字列アサーションの更新: `"recap@4.11.0"` → `"recap@4.12.0"`、`"qa@2.2.0"` → `"qa@2.3.0"`（該当テストファイルを `grep -rn` で洗い出してから更新）

## 完了の定義

- `pnpm tsc --noEmit` と `pnpm test` が通る
- `scripts/backfill-top14-team-stats.ts --dry-run` で対象試合が0件より多く表示される
- **本実行（実データ投入）・既存published Top14 recapの一括再生成は本タスクの範囲外**。マイグレーション・スクレイパー・パイプライン統合・テストまでを完了の定義とし、実行はOwner承認後に別途行う
- 変更ファイル: マイグレーション（新規）・`lib/scrapers/top14-match-stats.ts`（新規）・`scripts/backfill-top14-team-stats.ts`（新規）・`lib/llm/types.ts`・`lib/llm/stages/assemble.ts`・`lib/llm/stages/qa.ts`・`lib/llm/prompts/generate-recap.ts`・`lib/llm/prompts/qa-content.ts`・`lib/llm/pipeline.ts`・テストファイル群
- `lib/content/fabrication-guard.ts` は変更しない
