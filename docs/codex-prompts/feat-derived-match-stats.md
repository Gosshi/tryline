# Codex プロンプト: 派生試合スタッツの導入

仕様: `specs/feat-derived-match-stats.md` を参照（型定義・計算ルール・テストケースはすべて仕様書に記載）。

## タスク

`match_events` と lineups から派生スタッツ（連続得点・逆転幅・シンビン中の失点・コンバージョン成否・得点内訳・トライスコアラーのポジション等）を決定的に計算し、recap 生成プロンプトと QA プロンプトに注入する。

## 実装順序

1. **`lib/llm/stages/derived-stats.ts`（新規）** — 仕様書の `DerivedMatchStats` 型と `computeDerivedMatchStats` を実装。`pointsForEventType` は `assemble.ts` から export して import する（重複定義しない）
2. **`lib/llm/types.ts`** — `AssembledContentInput` に `derived_stats: DerivedMatchStats | null` を追加
3. **`lib/llm/stages/assemble.ts`** — `computeScoreTimeline` 呼び出し直後（L702 付近）で `computeDerivedMatchStats` を呼び、assembled に `derived_stats` を追加。`pointsForEventType` に `export` を付ける
4. **`lib/llm/prompts/generate-recap.ts`** — `PROMPT_VERSION = "recap@4.9.0"` にバンプ。`derivedStatsBlock` を追加（文言は仕様書のとおり）し、プロンプト配列の `scoreTimelineBlock` の隣に挿入
5. **`lib/llm/prompts/qa-content.ts`** — `PROMPT_VERSION = "qa@2.2.0"` にバンプ。`QaMatchContext` に `derivedStats?: DerivedMatchStats | null` を追加し、`derivedStatsBlock` をプロンプトに挿入（文言は仕様書のとおり）
6. **`lib/llm/pipeline.ts`** — QA 呼び出し2箇所（L245・L368 付近の `sourcedFacts: assembled.sourced_facts` の隣）に `derivedStats: assembled.derived_stats` を追加
7. **テスト** — 下記

## エッジケース（必ずテストすること）

- `minute === null` のイベント: 時間依存メトリクスから除外、件数系（conversions / points_breakdown / try_scorers）にはカウント
- `is_penalty_try === true` のトライ: conversions.attempts から除外
- `team_name` がどちらのチーム名とも不一致: イベントごと skip
- yellow card のシンビン窓は `[minute, minute + 10]`、red card は `[minute, 80]`
- 引き分け試合: comeback は null
- events 空配列: 戻り値 null
- try_scorers の lineups join は `player_name` と `name` の完全一致のみ

## テスト

新規 `tests/llm/stages/derived-stats.test.ts`:
- 17 連続得点（try+con+try+con+pg）→ `scoring_runs` に `{ points: 17 }` が1件
- 前半 0-12 → 最終 20-12 → `comeback: { team: "home", deficit_overcome: 12 }`
- yellow card 50分・相手が 55分 try+con、58分 pg → `opponent_points_during: 10`
- penalty try 1本 + 通常 try 2本 + conversion 成功 2本 → `conversions: { made: 2, attempts: 2 }`
- minute null の try が scoring_runs に影響しない
- 空 events → null

既存テストの更新:
- `"recap@4.8.0"` → `"recap@4.9.0"`: `tests/llm/prompts/generate-recap.test.ts`, `tests/scripts/regenerate-overseas-content.test.ts`
- `"qa@2.1.0"` のアサートがあれば `"qa@2.2.0"` に更新
- `tests/llm/prompts/generate-recap.test.ts` に追加: derived_stats を含む assembled でプロンプトに「派生スタッツ derived_stats」「分数表記のみ」が含まれること、`derived_stats: null` のときブロックが含まれないこと
- assemble のモックを使う既存テスト（`tests/scripts/regenerate-overseas-content.test.ts` 等）で `derived_stats` フィールド欠落により型エラーが出る場合はモックに `derived_stats: null` を追加

## 完了の定義

- `pnpm tsc --noEmit` が通る
- `pnpm test` が通る
- 変更ファイル: `derived-stats.ts`（新規）・`types.ts`・`assemble.ts`・`generate-recap.ts`・`qa-content.ts`・`pipeline.ts`・テストファイル群
- マイグレーションなし・DB 変更なし・generate-preview.ts は触らない
