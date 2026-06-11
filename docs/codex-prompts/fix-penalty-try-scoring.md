# Codex プロンプト: penalty try 採点と penalty_count の修正

仕様: `specs/fix-penalty-try-scoring.md` を参照。

## タスク

`lib/llm/stages/assemble.ts` の2つの採点バグを修正する。

1. penalty try が 5 点で計算されている（正: 7 点）→ イベント合計≠最終スコア不一致 38 件の原因
2. `computeMatchStats` が `type === "penalty"` をカウントしているが DB の type は `penalty_goal` → penalty_count が全試合 0

## 変更ファイルと内容

### 1) `lib/llm/stages/assemble.ts` — `pointsForEventType` の置き換え（L147-154）

仕様書のコードのとおり、`pointsForEvent(event)` に変更:
- `type === "try"` かつ `is_penalty_try === true` → 7 点（定数 `PENALTY_TRY_POINTS`）
- 通常 try → 5 点（定数 `TRY_POINTS`）
- その他は従来どおり

`computeScoreTimeline` 内の呼び出し `pointsForEventType(event.type)`（L182 付近）を `pointsForEvent(event)` に変更。

### 2) `lib/llm/stages/assemble.ts` — `computeMatchStats`（L119）

`event.type === "penalty"` → `event.type === "penalty_goal"` に変更。

## テスト

- `computeScoreTimeline`: `{ type: "try", is_penalty_try: true, ... }` を含むイベント列で final スコアに 7 点が加算されるケースを追加
- `computeScoreTimeline`: 通常 try が 5 点のままであること（既存テストが通ること）
- `computeMatchStats`: `penalty_goal` イベントが penalty_count にカウントされるケースを追加
- 既存テストで try=5 前提のスコア期待値が壊れる場合は、テストデータに `is_penalty_try` が含まれていないことを確認の上で期待値を維持（通常 try の挙動は不変のため、壊れるのは penalty try を含むケースのみのはず）

## 完了の定義

- `pnpm tsc --noEmit` が通る
- `pnpm test` が通る
- 変更ファイル: `lib/llm/stages/assemble.ts` とテストファイルのみ
- マイグレーションなし・プロンプトバージョン変更なし
