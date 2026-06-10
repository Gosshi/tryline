# Codex プロンプト: スコアイベント整合性チェック

仕様: `specs/fix-score-event-integrity-check.md` を参照（内容はインライン展開しない）。

## タスク

得点イベントの合計と最終スコアが食い違う試合を検知し、`console.warn` と `pipeline_runs` ログで可視化する。
変更は 2 ファイルのみ。自動修正なし・検知のみ。

## 変更ファイルと内容

### 1) `lib/llm/stages/assemble.ts`

**a) `ScoreTimeline` 型に 2 フィールドを追加する**

`ScoreTimeline` 型の定義（assemble.ts または `lib/llm/types.ts` にある方）に追加:

```typescript
export type ScoreTimeline = {
  final_away: number;  // 追加
  final_home: number;  // 追加
  ht_away: number;
  ht_home: number;
  lead_changes: Array<{ ... }>;
  winning_score: { ... } | null;
};
```

**b) `computeScoreTimeline` の return 文に 2 フィールドを追加する**

関数末尾の return 文（既存の変数名に合わせる）:

```typescript
return {
  final_away: awayScore,  // 追加（変数名は関数内の累積変数に合わせる）
  final_home: homeScore,  // 追加（変数名は関数内の累積変数に合わせる）
  ht_away: htAway,
  ht_home: htHome,
  lead_changes: leadChanges,
  winning_score: winningScore,
};
```

### 2) `lib/llm/pipeline.ts`

**a) import に `computeScoreTimeline` を追加する**

```typescript
import { assembleMatchContentInput, computeScoreTimeline } from "@/lib/llm/stages/assemble";
```

**b) Stage 1 ログ直後に整合性チェックを挿入する**

`await logPipelineRun({ stage: 1, ... })` の直後、かつ `if (contentType === "recap" && assembled.match_events.length === 0)` ガードの**前**に挿入:

```typescript
if (contentType === "recap" && assembled.match_events.length > 0) {
  const timeline = computeScoreTimeline(
    assembled.match_events,
    assembled.match.home_team?.name ?? "Home",
    assembled.match.away_team?.name ?? "Away",
  );
  const homeDelta = (timeline?.final_home ?? 0) - (assembled.match.home_score ?? 0);
  const awayDelta = (timeline?.final_away ?? 0) - (assembled.match.away_score ?? 0);

  if (homeDelta !== 0 || awayDelta !== 0) {
    console.warn("[score-integrity] event total mismatch", {
      awayDelta,
      homeDelta,
      matchId,
    });

    await logPipelineRun({
      matchId,
      contentType,
      stage: 0,
      inputHash: "",
      output: { awayDelta, homeDelta, type: "score_event_mismatch" },
      costUsd: 0,
      durationMs: 0,
      status: "failed",
    });
  }
}
```

## 受け入れ条件（完了の定義）

- `pnpm build` 相当のビルド・TypeScript エラーなし。
- `ScoreTimeline` 型に `final_home: number` / `final_away: number` が存在する。
- イベント合計と最終スコアが一致する試合では `console.warn` が呼ばれない（単体テストで確認）。
- 不整合なデータ（例: try 1本=5点のホーム側イベント、final home_score=8）を渡すと `console.warn("[score-integrity] event total mismatch", ...)` が呼ばれる（単体テストで確認）。

## エッジケース・注意事項

- `computeScoreTimeline` が `null` を返す場合は `homeDelta` / `awayDelta` がどちらも 0 → warn しない（安全）。
- `stage: 0` は `pipeline_runs` に CHECK 制約なし（インデックスのみ）。問題が出た場合は `-1` を使う。
- 既存の `if (contentType === "recap" && assembled.match_events.length === 0)` skip ガードより**前**に挿入すること。

## 参考パターン

- `computeScoreTimeline` の呼び出し方は assemble.ts 内の既存利用箇所を参照。
- `logPipelineRun` の呼び出し形式は pipeline.ts の Stage 1〜4 ログを参照。
