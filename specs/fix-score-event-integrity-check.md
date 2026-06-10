# fix-score-event-integrity-check

## 背景

PMF 監査（2026-06-10）で、URC 準決勝 Glasgow vs Bulls の試合ページにおいて得点イベントの合計（19点）が最終スコア（22点）と不一致であることが発見された（Bulls の PG 1本欠落と推定）。得点推移グラフ・タイムラインを差別化機能として訴求している以上、スコアとの不整合は信頼を損なう。

現状: `computeScoreTimeline`（`lib/llm/stages/assemble.ts`）がイベントから累積スコアを計算しているが、最終集計値を返さない。`pipeline.ts` で不整合を検知・記録する仕組みがない。

## スコープ

対象:
- `lib/llm/stages/assemble.ts`: `computeScoreTimeline` の戻り値に `final_home` / `final_away` を追加
- `lib/llm/pipeline.ts`: アセンブル後に整合性チェックを呼び、不一致を `console.warn` + pipeline_runs にログ記録

対象外:
- スコア不整合の自動修正（データ品質は別問題）
- UI 側での注記・免責表示（別 spec で判断）
- 過去の不整合 recap の再生成（手動対応）

## データモデル変更

なし。pipeline_runs テーブルの既存 `output` JSON カラムに追記するのみ（スキーマ変更不要）。

## API サーフェス

なし。

## UI サーフェス

なし。

## LLM 連携

なし（コスト影響ゼロ）。

## 変更詳細

### 1. `lib/llm/stages/assemble.ts` — `computeScoreTimeline` の戻り値拡張

`ScoreTimeline` 型と return 文に `final_home: number` / `final_away: number` を追加する。

関数末尾（L246付近）:
```typescript
return {
  final_away: awayScore,  // 追加
  final_home: homeScore,  // 追加
  ht_away: htAway,
  ht_home: htHome,
  lead_changes: leadChanges,
  winning_score: winningScore,
};
```

### 2. `lib/llm/pipeline.ts` — 整合性チェック

アセンブル完了直後（`assembled` が取得できた時点）、Stage 1 ログの直後に追加する。対象は `contentType === "recap"` かつ `match_events` が存在する場合のみ。

```typescript
if (assembled.match_events.length > 0 && contentType === "recap") {
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

`pipeline.ts` の import に `computeScoreTimeline` を追加すること。

## 受け入れ条件

1. `ScoreTimeline` 型に `final_home: number` / `final_away: number` が存在する
2. イベント合計と最終スコアが一致する試合では `console.warn` が呼ばれない
3. 不整合なイベントデータ（例: try 1本=5点 on home side, final home_score=8）を渡すと `console.warn("[score-integrity] event total mismatch", ...)` が呼ばれる（単体テストで確認）
4. ビルド・TypeScript エラーなし

## 未解決の質問

- `stage: 0` が pipeline_runs の既存制約に違反しないか確認すること。問題あれば `stage: -1` または別の sentinel 値を使う
