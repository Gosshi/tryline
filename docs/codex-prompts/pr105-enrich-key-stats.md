# PR #105 — `key_stats` を拡張してコンテンツ品質を改善

## 背景

現在の `AssembledContentInput.key_stats` には `avg_points_for/against_last_5` しかない。
GPT-4o はスコア平均しか受け取れないため、「どんな試合か」の分析が新聞記事の箱書き水準にとどまる。

`assemble.ts` はすでに `recentMatches`（直近20試合）と `match_events` を取得している。
**追加 DB クエリなし**でより豊かな指標を計算し、プロンプトに渡すことで出力品質を上げる。

## スコープ

対象:
- `lib/llm/types.ts` — `key_stats` 型の拡張
- `lib/llm/stages/assemble.ts` — 計算ロジックの追加
- `lib/llm/prompts/generate-preview.ts` — プロンプト指示の更新（バージョン bump）
- `lib/llm/prompts/generate-recap.ts` — 同上

対象外:
- 新規 DB クエリは追加しない
- English ナラティブプロンプト（`buildEnglishNarrativePrompt`）は今回変更しない
- `extract-tactical-points.ts` は変更しない

---

## 変更仕様

### 1. `lib/llm/types.ts` — `key_stats` 型を拡張

```ts
// Before
key_stats: {
  home: {
    avg_points_for_last_5: number | null;
    avg_points_against_last_5: number | null;
  };
  away: {
    avg_points_for_last_5: number | null;
    avg_points_against_last_5: number | null;
  };
};

// After
key_stats: {
  home: {
    avg_points_for_last_5: number | null;
    avg_points_against_last_5: number | null;
    win_rate_last_5: number | null;          // 0.0–1.0（小数点2桁）
    avg_score_diff_last_5: number | null;   // 正 = 攻撃優位、負 = 守備課題
    result_streak: "winning" | "losing" | "mixed" | null;
  };
  away: {
    avg_points_for_last_5: number | null;
    avg_points_against_last_5: number | null;
    win_rate_last_5: number | null;
    avg_score_diff_last_5: number | null;
    result_streak: "winning" | "losing" | "mixed" | null;
  };
  match: {
    penalty_count: { home: number; away: number };
    try_count: { home: number; away: number };
    late_scoring: boolean; // 70分以降の得点イベントが存在するか
  };
};
```

---

### 2. `lib/llm/stages/assemble.ts` — 計算ロジック

#### チームフォームスタッツの計算関数を追加

`assembleMatchContentInput` の外（ファイルスコープ）に追加する。

```ts
function computeTeamFormStats(
  recent: Array<{
    home_team_name: string;
    away_team_name: string;
    home_score: number | null;
    away_score: number | null;
  }>,
  teamName: string,
): {
  win_rate_last_5: number | null;
  avg_score_diff_last_5: number | null;
  result_streak: "winning" | "losing" | "mixed" | null;
} {
  if (recent.length === 0) {
    return { win_rate_last_5: null, avg_score_diff_last_5: null, result_streak: null };
  }

  type Result = "win" | "loss" | "draw";
  const results: Result[] = [];
  const diffs: number[] = [];

  for (const m of recent) {
    const isHome = m.home_team_name === teamName;
    const scored = isHome ? m.home_score : m.away_score;
    const conceded = isHome ? m.away_score : m.home_score;
    if (scored === null || conceded === null) continue;

    diffs.push(scored - conceded);
    if (scored > conceded) results.push("win");
    else if (scored < conceded) results.push("loss");
    else results.push("draw");
  }

  if (results.length === 0) {
    return { win_rate_last_5: null, avg_score_diff_last_5: null, result_streak: null };
  }

  const wins = results.filter((r) => r === "win").length;
  const win_rate_last_5 = Number((wins / results.length).toFixed(2));
  const avg_score_diff_last_5 = average(diffs);
  const allWins = results.every((r) => r === "win");
  const allLosses = results.every((r) => r === "loss");
  const result_streak: "winning" | "losing" | "mixed" =
    allWins ? "winning" : allLosses ? "losing" : "mixed";

  return { win_rate_last_5, avg_score_diff_last_5, result_streak };
}
```

#### 試合レベルスタッツの計算関数を追加

```ts
function computeMatchStats(
  events: AssembledContentInput["match_events"],
  homeTeamName: string,
  awayTeamName: string,
): AssembledContentInput["key_stats"]["match"] {
  let homePenalties = 0;
  let awayPenalties = 0;
  let homeTries = 0;
  let awayTries = 0;
  let lateScoring = false;

  for (const event of events) {
    const isHome = event.team_name === homeTeamName;
    if (event.type === "penalty") {
      if (isHome) homePenalties++;
      else awayPenalties++;
    }
    if (event.type === "try") {
      if (isHome) homeTries++;
      else awayTries++;
    }
    if (event.minute !== null && event.minute >= 70) {
      lateScoring = true;
    }
  }

  return {
    penalty_count: { home: homePenalties, away: awayPenalties },
    try_count: { home: homeTries, away: awayTries },
    late_scoring: lateScoring,
  };
}
```

#### `assembleMatchContentInput` の戻り値を更新

`matchEvents` が解決した後（`Promise.all` の下）に計算を追加し、`key_stats` に組み込む:

```ts
const homeFormStats = computeTeamFormStats(homeRecent, homeTeamName);
const awayFormStats = computeTeamFormStats(awayRecent, awayTeamName);
const matchStats = computeMatchStats(matchEvents, homeTeamName, awayTeamName);

return {
  // ...既存フィールド...
  key_stats: {
    home: {
      avg_points_for_last_5: average(homeFor),
      avg_points_against_last_5: average(homeAgainst),
      ...homeFormStats,
    },
    away: {
      avg_points_for_last_5: average(awayFor),
      avg_points_against_last_5: average(awayAgainst),
      ...awayFormStats,
    },
    match: matchStats,
  },
};
```

---

### 3. プロンプト更新 (`generate-preview.ts` / `generate-recap.ts`)

バージョンをそれぞれ bump する（`preview@2.0.0`、`recap@2.3.0`）。

**`generate-preview.ts` の `dataSparseBlock` に追加:**

```ts
"- key_stats.home/away の win_rate_last_5 を使い「好調（0.8〜）」「低調（0.2以下）」等の表現で状態を描写すること",
"- key_stats.home/away の avg_score_diff_last_5 が正なら攻撃優位、負なら守備に課題があると読み取ること",
"- key_stats.home/away の result_streak が winning/losing の場合は連勝・連敗ストリーク（何連勝/連敗かは recent_form から数える）を明示すること",
```

**`generate-recap.ts` の `dataSparseBlock` に追加（既存指示の末尾に追記）:**

```ts
"- key_stats.match.penalty_count の合計が 8 以上の場合、テリトリー・プレッシャー型の試合と評価すること",
"- key_stats.match.try_count からオープンなラグビー（ハイトライ）かキック主体（ロートライ）かを評価すること",
"- key_stats.match.late_scoring が true の場合、終盤まで試合が動いた展開であることを明記すること",
```

---

## 完了の定義

- [ ] `AssembledContentInput` の `key_stats` に新フィールドが型として定義されている
- [ ] `computeTeamFormStats` が `homeRecent` / `awayRecent` から正しく計算する
- [ ] `computeMatchStats` が `match_events` から正しく計算する
- [ ] `matchEvents` が空（試合前プレビュー）の場合、count は 0 / `late_scoring` は false
- [ ] 既存の `average()` 関数を再利用している
- [ ] プロンプトバージョンが bump されている
- [ ] TypeScript エラーなし・`pnpm build` 通過
