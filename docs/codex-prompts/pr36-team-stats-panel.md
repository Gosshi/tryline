# feat: チームページ スタッツパネル

## 目的

チームページ (`/teams/[slug]`) に統計パネルを追加し、試合一覧だけでなく
チームの実力・傾向を一目で把握できるようにする。

LLM 生成なし。すべて既存の `matches` / `match_events` テーブルから計算する。

**必ず `design.md` を最初に読んでから実装すること。**

---

## 追加するデータ（3ブロック）

### ブロック 1: 勝敗記録 + フォーム

直近 30 試合（`status='finished'`）の集計:

- 勝 / 引分 / 負 のカウント
- 得点合計 / 失点合計
- フォーム: 最新 5 試合を `W / D / L` のドット（緑 / 灰 / 赤）で表示（新しい順）

判定ロジック:

```
team が home_team → home_score vs away_score
team が away_team → away_score vs home_score
```

### ブロック 2: 得点スタッツ

`match_events` に 1 件以上あった試合のみ集計対象（events 未取得試合は除外）。

- 平均得点 / 試合（スコアから）
- 平均トライ数 / 試合
- 平均ペナルティゴール数 / 試合

集計対象イベントのフィルタ: `team_id = このチームのID`

### ブロック 3: トップスコアラー（上位 5 名）

`match_events` の `metadata->>'player_name'` を player_name として集計。
player_name が null または空文字の行は除外。

各選手について:

- tries: `type='try'` の件数
- conversions: `type='conversion'` の件数
- penalties: `type='penalty_goal'` または `type='drop_goal'` の件数
- total_actions: 上記合計（ソートキー）

---

## 実装

### 1. `lib/db/queries/team-stats.ts`（新規）

```ts
export type TeamRecord = {
  wins: number;
  draws: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  form: Array<"W" | "D" | "L">; // 直近 5 試合、新しい順
  matchCount: number;
};

export type TeamScoringStats = {
  matchCount: number; // match_events がある試合数（0 の場合は全フィールド 0）
  pointsForPerMatch: number;
  triesPerMatch: number;
  penaltyGoalsPerMatch: number;
};

export type TopScorer = {
  playerName: string;
  tries: number;
  conversions: number;
  penalties: number; // penalty_goal + drop_goal
};

export async function getTeamRecord(teamId: string): Promise<TeamRecord>;
export async function getTeamScoringStats(
  teamId: string,
): Promise<TeamScoringStats>;
export async function getTeamTopScorers(
  teamId: string,
  limit?: number,
): Promise<TopScorer[]>;
export async function getTeamStatsData(teamId: string): Promise<{
  record: TeamRecord;
  scoring: TeamScoringStats;
  topScorers: TopScorer[];
}>;
```

#### getTeamRecord の実装方針

```ts
// matches から直近 30 件の finished 試合を取得
const matches = await client
  .from("matches")
  .select("id, home_team_id, away_team_id, home_score, away_score, kickoff_at")
  .eq("status", "finished")
  .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
  .order("kickoff_at", { ascending: false })
  .limit(30);

// TypeScript 側で wins/draws/losses/pointsFor/pointsAgainst を集計
// form は最初の 5 件を取り出して Array<"W"|"D"|"L"> に変換
// home_score または away_score が null の試合は除外
```

#### getTeamScoringStats の実装方針

```ts
// match_events を team_id で取得（type に絞る）
const events = await client
  .from("match_events")
  .select("match_id, type")
  .eq("team_id", teamId)
  .in("type", ["try", "penalty_goal", "drop_goal"]);

// match_id の重複排除で matchCount を算出
// 各試合ごとにイベント数を集計して per-match の平均を計算
// pointsForPerMatch は getTeamRecord の pointsFor/matchCount から計算（または別途取得）
```

#### getTeamTopScorers の実装方針

```ts
// match_events を team_id + metadata で取得
const events = await client
  .from("match_events")
  .select("type, metadata")
  .eq("team_id", teamId)
  .in("type", ["try", "conversion", "penalty_goal", "drop_goal"]);

// TypeScript 側で metadata->>'player_name' をキーに集計
// player_name が null/空文字の行は除外
// total_actions 降順で limit 件を返す
```

---

### 2. `components/team-stats-panel.tsx`（新規）

サーバーコンポーネント。props で `record`・`scoring`・`topScorers` を受け取って表示する。

#### レイアウト

```
[勝敗カード]      [得点スタッツカード]
[         トップスコアラー         ]
```

モバイルでは縦積み。`md:grid-cols-2` で 2 カラム（上 2 枚）、トップスコアラーは全幅。

#### 勝敗カード

```
W 12  D 1  L 4  （直近 17 試合）
得点合計 437 / 失点合計 218
フォーム: ● ● ○ ○ ●  （緑=W、赤=L、灰=D）
```

#### 得点スタッツカード

```
平均得点        32.7
平均トライ      3.4 / 試合
平均ペナルティ  2.1 / 試合
```

match_events が 0 試合の場合は「イベントデータなし」を表示（カードを消さない）。

#### トップスコアラー

| 選手名 | T   | Con | PG  | 計  |
| ------ | --- | --- | --- | --- |
| …      | 5   | 12  | 8   | 25  |

列ヘッダー: `T = トライ`, `Con = コンバージョン`, `PG = ペナルティ/DG`

---

### 3. `app/teams/[slug]/page.tsx`（変更）

`getTeamPageDataBySlug` と並列に `getTeamStatsData(row.id)` を呼び出し、
チームヘッダーと「直近の試合」セクションの間に `<TeamStatsPanel>` を挿入する。

```ts
// page.tsx 内の並列取得
const [data, stats] = await Promise.all([
  getTeamPageDataBySlug(slug),
  getTeamStatsData(teamId).catch(() => null), // エラー時はパネル非表示
]);
```

stats が null の場合は `<TeamStatsPanel>` をレンダリングしない（ページ全体は壊れない）。

---

## 変更・作成するファイル

| ファイル                          | 操作                          |
| --------------------------------- | ----------------------------- |
| `lib/db/queries/team-stats.ts`    | 新規作成                      |
| `components/team-stats-panel.tsx` | 新規作成                      |
| `app/teams/[slug]/page.tsx`       | stats データ取得 + パネル挿入 |

---

## 変更しないこと

- `lib/db/queries/teams.ts`（既存クエリはそのまま）
- `match_events` テーブルのスキーマ
- `scripts/` 以下のバックフィルスクリプト

---

## エッジケース

- `match_events` が 0 件のチーム: `TeamScoringStats.matchCount === 0` → 得点スタッツカードに「イベントデータなし」を表示
- 試合数 < 5 のチーム: form は試合数ぶんのドットのみ表示
- `player_name` が空の `match_events`: トップスコアラー集計から除外（エラーにしない）
- スコアが null の試合（未確定）: 勝敗集計から除外

---

## テスト

`tests/lib/db/queries/team-stats.test.ts` を新規作成。
集計ロジックを純粋関数に切り出してユニットテストすること。

### テスト 1: 勝敗集計

ホームとアウェイが混在した試合配列からの W/D/L 計算:

```ts
const matches = [
  {
    home_team_id: TEAM_ID,
    away_team_id: OTHER_ID,
    home_score: 30,
    away_score: 10,
  }, // W
  {
    home_team_id: OTHER_ID,
    away_team_id: TEAM_ID,
    home_score: 20,
    away_score: 20,
  }, // D
  {
    home_team_id: TEAM_ID,
    away_team_id: OTHER_ID,
    home_score: 10,
    away_score: 25,
  }, // L
];
// expects: wins=1, draws=1, losses=1
```

### テスト 2: フォームは最新 5 件（新しい順）

直近 7 試合のうち最新 5 件が [W,W,L,D,W] のとき、form の長さが 5 で form[0] が最新の結果であること。

### テスト 3: トップスコアラー集計

同一 player_name で複数行あった場合に type ごとに正しくカウントされる。

### テスト 4: player_name null/空文字の除外

`metadata: {}` の行がトップスコアラーに含まれないこと。

### テスト 5: match_events が 0 件

`getTeamScoringStats` で `matchCount === 0` のとき全フィールドが 0 であること。

---

## 完了条件

- `pnpm tsc --noEmit` パス
- `pnpm test` パス（新規テスト含む）
- `/teams/england` にアクセスしてスタッツパネルが表示される
- `/teams/georgia` など match_events が少ないチームでもエラーにならない
- モバイル（375px）でレイアウト崩れなし

## ブランチ・PR

- ブランチ: `feat/team-stats-panel`
- PR タイトル: `Feat: Add stats panel to team pages (record, scoring, top scorers)`
