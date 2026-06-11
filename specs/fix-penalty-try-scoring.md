# fix-penalty-try-scoring

## 背景

2026-06-11 のイベント整合性検証で、`lib/llm/stages/assemble.ts` に2つの採点バグを確認した。

### バグ1: penalty try を 5 点で計算

`pointsForEventType`（L147-154）は `type === "try"` を一律 5 点とするが、**penalty try は 7 点（コンバージョン不要）**。DB には `metadata.is_penalty_try = true` のトライが 53 件あり、`assemble.ts` の L451 で `is_penalty_try` フラグとしてマップ済みなのに採点で無視されている。

**実測影響**: イベント合計≠最終スコアの不一致 262 件のうち **38 件がこのバグで完全に説明できる**（差分が「penalty try 数 × 2」と一致）。Premiership・Six Nations・RWC・リーグワンの小差分はほぼこれ。

### バグ2: `computeMatchStats` の penalty_count が常に 0

`computeMatchStats`（L119）が `event.type === "penalty"` をカウントしているが、**DB に存在する type は `penalty_goal`**（1,804 件。`penalty` は 0 件）。そのため `key_stats.match.penalty_count` は全試合で `{home: 0, away: 0}` になっており、recap 生成プロンプトに誤った情報（PG 0 本）を渡し続けている。

## スコープ

対象:
- `lib/llm/stages/assemble.ts`: `pointsForEventType` の penalty try 対応・`computeMatchStats` の type 修正
- 影響を受けるテストの更新

対象外:
- 既存 recap の再生成（保留中のバッチ再生成でまとめて反映）
- `scripts/fill-event-gaps.ts` の挿入前ガード（`fix-contaminated-match-events` の Part B-2 でカバー。ガードは「超過のみ検知」なので try=5 のままで安全側）
- `feat-derived-match-stats`（未実装 spec）との整合: 同 spec は `pointsForEventType` を import する設計のため、本修正が先に入れば自動で恩恵を受ける

## データモデル変更

なし。

## API サーフェス

なし。

## LLM 連携

なし（プロンプトバージョン変更不要。入力データの正確性が上がるだけで形式は不変）。

## 変更詳細

### 1. `pointsForEventType` → イベント単位の採点に変更

シグネチャを type 文字列からイベントオブジェクトに変更する（penalty try フラグを見るため）:

```typescript
// Before
function pointsForEventType(type: string): number {
  if (type === "try") return 5;
  if (type === "conversion") return 2;
  if (type === "penalty" || type === "penalty_goal" || type === "drop_goal") {
    return 3;
  }
  return 0;
}

// After
const PENALTY_TRY_POINTS = 7;
const TRY_POINTS = 5;

function pointsForEvent(
  event: Pick<AssembledContentInput["match_events"][number], "type" | "is_penalty_try">,
): number {
  if (event.type === "try") {
    return event.is_penalty_try === true ? PENALTY_TRY_POINTS : TRY_POINTS;
  }
  if (event.type === "conversion") return 2;
  if (
    event.type === "penalty" ||
    event.type === "penalty_goal" ||
    event.type === "drop_goal"
  ) {
    return 3;
  }
  return 0;
}
```

`computeScoreTimeline` 内の呼び出し（L182 付近 `pointsForEventType(event.type)`）を `pointsForEvent(event)` に変更。

注: `"penalty"` の分岐は DB に存在しない type だが、後方互換のため残してよい。

### 2. `computeMatchStats` の type 修正（L119）

```typescript
// Before
if (event.type === "penalty") {

// After
if (event.type === "penalty_goal") {
```

### 3. テスト

`computeScoreTimeline` の既存テスト（`tests/` 配下で `computeScoreTimeline` を検証しているファイル）を確認し、penalty try ケースを追加:

- `{ type: "try", is_penalty_try: true }` を含むイベント列で、final スコアに 7 点が加算される
- 通常 try は従来どおり 5 点
- `computeMatchStats`: `penalty_goal` イベントが penalty_count にカウントされる（従来は 0 だったことの回帰テスト）

`fix-score-event-integrity-check`（#398）で導入した pipeline の整合性チェックは `computeScoreTimeline` を使っているため、本修正により penalty try 由来の偽陽性 warn が 38 件分消える（チェック側のコード変更は不要）。

## 受け入れ条件

1. penalty try（`is_penalty_try: true`）が 7 点として `computeScoreTimeline` の final/ht スコアに反映される（単体テスト）
2. 通常トライは 5 点のまま（既存テストが通る）
3. `computeMatchStats` が `penalty_goal` を penalty_count にカウントする（単体テスト）
4. `pnpm test` 全体が通る・TypeScript strict エラーなし

## 未解決の質問

なし（実装開始可能）
