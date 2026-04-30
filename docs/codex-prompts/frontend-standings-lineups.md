# Codex プロンプト: 順位表・出場選手テーブル

## タスク 3: コンペティション順位表

### データモデル（既存テーブル）

`competition_standings` テーブル（既存）:

| カラム | 型 |
|---|---|
| `competition_id` | uuid |
| `team_id` | uuid → `teams.name`, `teams.short_code` |
| `position` | integer |
| `played` | integer |
| `won` | integer |
| `drawn` | integer |
| `lost` | integer |
| `points_for` | integer |
| `points_against` | integer |
| `tries_for` | integer |
| `bonus_points_try` | integer |
| `bonus_points_losing` | integer |
| `total_points` | integer |

### Step A: スタンディングス計算スクリプト（新規作成）

`scripts/calculate-standings.ts` を作成する。

**計算ルール（Six Nations 標準）:**
- 勝利: 4pts、引き分け: 2pts、敗北: 0pts
- ボーナスポイント（試行）: 1試合で 4トライ以上 → +1pt
- ボーナスポイント（惜敗）: 7点差以内の敗北 → +1pt

**引数:** `--slug=six-nations-2025`

**処理フロー:**
1. `--slug` で指定したコンペティションを取得
2. 全 `finished` 試合を取得（`home_team_id`, `away_team_id`, `home_score`, `away_score`）
3. 各試合の `match_events` から `type = 'try'` をカウントしてチームごとのトライ数を集計
4. チームごとに勝敗・ポイント・ボーナスを集計
5. `position` は `total_points` 降順 → `points_for - points_against` 降順で決定
6. `competition_standings` に upsert

実行コマンド:
```bash
node --env-file=.env.local tools/run-ts.cjs scripts/calculate-standings.ts --slug=six-nations-2025
```

### Step B: クエリ関数

`lib/db/queries/standings.ts` を新規作成する。

```typescript
import { getSupabasePublicServerClient } from "@/lib/db/public-server";

export type StandingRow = {
  position: number;
  teamName: string;
  teamShortCode: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  triesFor: number;
  bonusPointsTry: number;
  bonusPointsLosing: number;
  totalPoints: number;
};

export async function getStandingsForCompetition(
  competitionSlug: string,
): Promise<StandingRow[]> {
  const client = getSupabasePublicServerClient();

  const { data: competition, error: compError } = await client
    .from("competitions")
    .select("id")
    .eq("slug", competitionSlug)
    .maybeSingle();

  if (compError) throw compError;
  if (!competition) return [];

  const { data, error } = await client
    .from("competition_standings")
    .select(`
      position,
      played, won, drawn, lost,
      points_for, points_against,
      tries_for,
      bonus_points_try, bonus_points_losing,
      total_points,
      team:teams!competition_standings_team_id_fkey (
        name,
        short_code
      )
    `)
    .eq("competition_id", competition.id)
    .order("position", { ascending: true });

  if (error) throw error;

  return data.map((row) => {
    const team = row.team as { name: string; short_code: string | null } | null;
    return {
      bonusPointsLosing: row.bonus_points_losing,
      bonusPointsTry: row.bonus_points_try,
      drawn: row.drawn,
      lost: row.lost,
      played: row.played,
      pointsAgainst: row.points_against,
      pointsFor: row.points_for,
      position: row.position,
      teamName: team?.name ?? "—",
      teamShortCode: team?.short_code ?? "—",
      totalPoints: row.total_points,
      triesFor: row.tries_for,
      won: row.won,
    };
  });
}
```

### Step C: `StandingsTable` コンポーネント

`components/standings-table.tsx` を新規作成する。データがなければ `null` を返す。

```tsx
import type { StandingRow } from "@/lib/db/queries/standings";

export function StandingsTable({ standings }: { standings: StandingRow[] }) {
  if (standings.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-4 border-b border-slate-100 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
          Standings
        </p>
        <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-950">順位表</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs font-semibold text-slate-400">
              <th className="pb-2 text-left">#</th>
              <th className="pb-2 text-left">チーム</th>
              <th className="pb-2 text-right">試</th>
              <th className="pb-2 text-right">勝</th>
              <th className="pb-2 text-right">分</th>
              <th className="pb-2 text-right">敗</th>
              <th className="pb-2 text-right">得点</th>
              <th className="pb-2 text-right">T</th>
              <th className="pb-2 text-right font-bold text-slate-600">勝点</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row) => (
              <tr className="border-b border-slate-50 last:border-0" key={row.position}>
                <td className="py-2 pr-3 tabular-nums text-slate-400">{row.position}</td>
                <td className="py-2 pr-4 font-semibold text-slate-900">{row.teamShortCode}</td>
                <td className="py-2 text-right tabular-nums text-slate-600">{row.played}</td>
                <td className="py-2 text-right tabular-nums text-slate-600">{row.won}</td>
                <td className="py-2 text-right tabular-nums text-slate-600">{row.drawn}</td>
                <td className="py-2 text-right tabular-nums text-slate-600">{row.lost}</td>
                <td className="py-2 text-right tabular-nums text-slate-600">
                  {row.pointsFor}–{row.pointsAgainst}
                </td>
                <td className="py-2 text-right tabular-nums text-slate-600">{row.triesFor}</td>
                <td className="py-2 text-right tabular-nums font-bold text-slate-950">
                  {row.totalPoints}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

### Step D: `app/page.tsx` に順位表を追加

```tsx
import { getStandingsForCompetition } from "@/lib/db/queries/standings";
import { StandingsTable } from "@/components/standings-table";

// 既存の Promise.all に追加
const [matches, standings] = await Promise.all([
  listMatchesForCompetition(competition.slug),
  getStandingsForCompetition(competition.slug),
]);

// JSX 内: ラウンド一覧の後ろに追加
<StandingsTable standings={standings} />
```

---

## タスク 2: 出場選手セクションのデザイン改善

`components/match-lineups-section.tsx` の `PlayerRow` と区切りラベルを改善する。

### ポジションをバッジ表示に

```tsx
{player.position && (
  <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
    {player.position}
  </span>
)}
```

### 控えの区切りを「— 控え —」ラベル付きに

```tsx
<div className="my-3 flex items-center gap-2">
  <div className="h-px flex-1 bg-slate-100" />
  <span className="text-xs text-slate-400">控え</span>
  <div className="h-px flex-1 bg-slate-100" />
</div>
```

---

## 変更するファイル一覧

| ファイル | 変更内容 |
|---|---|
| `scripts/calculate-standings.ts` | 新規作成: 順位計算・upsert スクリプト |
| `lib/db/queries/standings.ts` | 新規作成: `getStandingsForCompetition` |
| `components/standings-table.tsx` | 新規作成: 順位表コンポーネント |
| `app/page.tsx` | 順位表を追加 |
| `components/match-lineups-section.tsx` | ポジションバッジ・控えラベルのデザイン改善 |

## 完了条件

- `pnpm tsc --noEmit` がエラーなし
- `node --env-file=.env.local tools/run-ts.cjs scripts/calculate-standings.ts --slug=six-nations-2025` が正常終了する
- スクリプト実行後にホームページを開くと「順位表」セクションが表示される
- 出場選手セクションにポジションバッジと控えラベルが表示される（データがある場合）
