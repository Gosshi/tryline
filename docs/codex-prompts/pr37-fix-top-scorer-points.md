# fix: トップスコアラーの「計」列をアクション数→得点に修正

## 背景

`/teams/[slug]` のトップスコアラー表で「計」列が
T+Con+PG の**アクション数合計**になっている。
ラグビーの得点換算（Try=5pts, Con=2pts, Pen/DG=3pts）で計算した**ポイント数**を表示すべき。

---

## 修正対象

| ファイル                                  | 操作                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `lib/db/queries/team-stats.ts`            | `TopScorer` 型に `points` 追加、`buildTopScorers` の計算・ソートを修正 |
| `components/team-stats-panel.tsx`         | 「計」列を `points` で表示                                             |
| `tests/lib/db/queries/team-stats.test.ts` | points 計算のテスト追加・更新                                          |

---

## 修正内容

### 1. `lib/db/queries/team-stats.ts`

#### `TopScorer` 型に `points` を追加

```ts
export type TopScorer = {
  playerName: string;
  tries: number;
  conversions: number;
  penalties: number;
  points: number; // tries×5 + conversions×2 + penalties×3
};
```

#### `buildTopScorers` のポイント計算とソート変更

スコアラーごとに `points = tries * 5 + conversions * 2 + penalties * 3` を計算し、
ソートキーを `points` 降順に変更する（同点の場合は tries → penalties → conversions → 名前順）。

```ts
// ソート変更後のイメージ
.sort((left, right) => {
  if (left.points !== right.points) return right.points - left.points;
  if (left.tries !== right.tries) return right.tries - left.tries;
  if (left.penalties !== right.penalties) return right.penalties - left.penalties;
  if (left.conversions !== right.conversions) return right.conversions - left.conversions;
  return left.playerName.localeCompare(right.playerName);
})
```

### 2. `components/team-stats-panel.tsx`

「計」列の表示値を `scorer.tries + scorer.conversions + scorer.penalties` から `scorer.points` に変更。
列ヘッダーは `計 (pts)` に変更する。

### 3. `tests/lib/db/queries/team-stats.test.ts`

既存テスト「aggregates top scorers by player name」を以下を確認するよう更新:

```ts
it("calculates scorer points and sorts by points descending", () => {
  const topScorers = buildTopScorers([
    { match_id: "m1", metadata: { player_name: "Finn Russell" }, type: "try" }, // 5pts
    {
      match_id: "m1",
      metadata: { player_name: "Finn Russell" },
      type: "conversion",
    }, // 2pts
    {
      match_id: "m2",
      metadata: { player_name: "Finn Russell" },
      type: "penalty_goal",
    }, // 3pts
    {
      match_id: "m2",
      metadata: { player_name: "Ben Spencer" },
      type: "penalty_goal",
    }, // 3pts
    {
      match_id: "m2",
      metadata: { player_name: "Ben Spencer" },
      type: "penalty_goal",
    }, // 3pts
  ]);

  expect(topScorers[0]).toMatchObject({
    playerName: "Finn Russell",
    tries: 1,
    conversions: 1,
    penalties: 1,
    points: 10, // 5+2+3
  });
  expect(topScorers[1]).toMatchObject({
    playerName: "Ben Spencer",
    penalties: 2,
    points: 6, // 3+3
  });
});
```

---

## 変更しないこと

- DB スキーマ・テーブル構造
- `getTeamRecord` / `getTeamScoringStats` の実装
- `TopScorer` 以外の型定義

---

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm test` パス
- `/teams/new-zealand` で Jordie Barrett の「計」が 72 (3×5+15×2+9×3) と表示される

## ブランチ・PR

- ブランチ: `fix/top-scorer-points`
- PR タイトル: `Fix: Calculate top scorer totals as points (not action count)`
