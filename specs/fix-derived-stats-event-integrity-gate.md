# fix-derived-stats-event-integrity-gate

## 背景

`feat-derived-match-stats`（#405）はイベントから「ゴール4/5」等のキック成否・連続得点を計算し、recap 本文の根拠として断定的に使わせる。しかしイベントが不完全な試合（2026-06-12 時点で finished の約2割: URC の欠落・SRP/RC の過剰計上）では、派生スタッツが事実と異なる数値になる:

- イベント欠落 → コンバージョン実数より少ない →「ゴール3/5」（実際は5/5）という**存在しないミスキックの捏造**
- イベント過剰 → made > attempts の破綻（「ゴール5/4」）

701件のバッチ再生成（recap@4.9.0）を前に、不正確な数字の大量出版を防ぐガードが必要。

## スコープ

対象:
- `lib/llm/stages/assemble.ts`: イベント合計と最終スコアが一致する場合のみ `derived_stats` を計算する

対象外:
- イベントデータ自体の修正（SRP/RC のキック過剰計上は別調査）
- `score_timeline` のゲート（HT スコア・リードチェンジは多少の欠落でも方向性は正しく、recap@4.7 以前から使用実績がある。今回は新規追加の derived_stats のみ対象）
- プロンプト変更・バージョンバンプ（入力が null になるだけで、null 時のプロンプト挙動は実装済み）

## 変更詳細

### `lib/llm/stages/assemble.ts`

ゲート判定をテスト可能な純関数として export し、`computeDerivedMatchStats` 呼び出し（L726 付近）を条件付きにする:

```typescript
export function eventTotalsMatchFinalScore(
  scoreTimeline: ScoreTimeline | null,
  homeScore: number | null,
  awayScore: number | null,
): boolean {
  return (
    scoreTimeline !== null &&
    homeScore !== null &&
    awayScore !== null &&
    scoreTimeline.final_home === homeScore &&
    scoreTimeline.final_away === awayScore
  );
}
```

```typescript
// Before
const derivedStats = computeDerivedMatchStats(
  matchEvents,
  projectedLineups,
  homeTeamName,
  awayTeamName,
);

// After
const derivedStats = eventTotalsMatchFinalScore(
  scoreTimeline,
  match.home_score,
  match.away_score,
)
  ? computeDerivedMatchStats(
      matchEvents,
      projectedLineups,
      homeTeamName,
      awayTeamName,
    )
  : null;
```

`scoreTimeline` は penalty try 7点込み（#408）で計算済みのため、PT を含む正常な試合はゲートを通過する。

## 受け入れ条件

1. `eventTotalsMatchFinalScore`: 一致 → true、片側でも不一致 → false、timeline null / score null → false（単体テスト）
2. イベント合計が最終スコアと一致しない assemble 結果では `derived_stats` が null（テスト: 既存の assemble 系テストまたは新規単体テスト）
3. 一致する試合では従来どおり `derived_stats` が計算される
4. `pnpm test`・`pnpm tsc --noEmit` が通る

## 未解決の質問

なし（実装開始可能）
