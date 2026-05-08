# p2-event-timeline-ui: 試合イベントタイムライン UI

## 前提

- `p2-ui-match-events-visual.md`（チームカラーバー追加）が完了していること
- `match_events` テーブルに `minute`, `type`, `team_id`, `player_name`, `points` カラムが存在すること
- `lib/format/team-identity.ts` に `getTeamColor(slug)` が実装済みであること

---

## 背景

現在の `components/match-events-section.tsx` はイベントをテキスト行で並べているだけで、試合の流れが視覚的に伝わらない。「Ireland 50-17 Italy のような大差がいつどうやって生まれたか」をスクロールなしで直感的に把握できる**スコア推移グラフ**を追加する。

このコンポーネントは全ユーザーに無料で公開する（Premium 不要）。

---

## 実装概要

試合イベントから**累積スコア推移**を計算し、SVG で折れ線グラフとして描画する。既存のイベントリスト（テキスト行）の上部に配置する。

---

## Task 1 — スコア累積計算ユーティリティ

### ファイル: `lib/format/match-timeline.ts`（新規作成）

```ts
export type ScorePoint = {
  minute: number;
  homeScore: number;
  awayScore: number;
  type: string;
  team: "home" | "away";
  playerName: string | null;
};

export function buildScoreTimeline(
  events: Array<{
    minute: number | null;
    type: string;
    teamId: string;
    playerName: string | null;
    points: number | null;
  }>,
  homeTeamId: string,
): ScorePoint[] {
  const scoring = events
    .filter((e) => e.minute !== null && (e.points ?? pointsFromType(e.type)) > 0)
    .sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));

  let homeScore = 0;
  let awayScore = 0;
  const timeline: ScorePoint[] = [
    { minute: 0, homeScore: 0, awayScore: 0, type: "kickoff", team: "home", playerName: null },
  ];

  for (const event of scoring) {
    const isHome = event.teamId === homeTeamId;
    const pts = event.points ?? pointsFromType(event.type);
    if (isHome) homeScore += pts;
    else awayScore += pts;

    timeline.push({
      minute: event.minute!,
      homeScore,
      awayScore,
      type: event.type,
      team: isHome ? "home" : "away",
      playerName: event.playerName,
    });
  }

  return timeline;
}

function pointsFromType(type: string): number {
  if (type === "try") return 5;
  if (type === "conversion") return 2;
  if (type === "penalty" || type === "drop_goal") return 3;
  return 0;
}
```

---

## Task 2 — ScoreGraph コンポーネント

### ファイル: `components/score-graph.tsx`（新規作成）

SVG で両チームのスコア推移を折れ線描画する。

**props:**

```tsx
import type { ScorePoint } from "@/lib/format/match-timeline";

type ScoreGraphProps = {
  timeline: ScorePoint[];
  homeTeamSlug: string;
  awayTeamSlug: string;
  finalHomeScore: number;
  finalAwayScore: number;
};
```

**実装:**

```tsx
"use client";

import { useState } from "react";

import { getTeamColor } from "@/lib/format/team-identity";
import type { ScorePoint } from "@/lib/format/match-timeline";

export function ScoreGraph({
  timeline,
  homeTeamSlug,
  awayTeamSlug,
  finalHomeScore,
  finalAwayScore,
}: ScoreGraphProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  const W = 560;
  const H = 120;
  const PAD = { top: 8, right: 8, bottom: 20, left: 28 };
  const maxMinute = Math.max(...timeline.map((p) => p.minute), 80);
  const maxScore = Math.max(finalHomeScore, finalAwayScore, 20) + 5;

  const toX = (m: number) =>
    PAD.left + (m / maxMinute) * (W - PAD.left - PAD.right);
  const toY = (s: number) =>
    PAD.top + (1 - s / maxScore) * (H - PAD.top - PAD.bottom);

  const homeColor = getTeamColor(homeTeamSlug);
  const awayColor = getTeamColor(awayTeamSlug);

  const homePath = timeline
    .map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.minute)},${toY(p.homeScore)}`)
    .join(" ");
  const awayPath = timeline
    .map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.minute)},${toY(p.awayScore)}`)
    .join(" ");

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "144px" }}>
        {/* ガイドライン */}
        {[0, Math.round(maxScore / 2), maxScore].map((s) => (
          <g key={s}>
            <line
              x1={PAD.left} y1={toY(s)} x2={W - PAD.right} y2={toY(s)}
              stroke="oklch(90% 0.01 260)" strokeWidth={0.5}
            />
            <text x={PAD.left - 4} y={toY(s) + 4} textAnchor="end" fontSize={9} fill="oklch(45% 0.02 260)">
              {s}
            </text>
          </g>
        ))}
        {/* 80分ライン */}
        <line
          x1={toX(80)} y1={PAD.top} x2={toX(80)} y2={H - PAD.bottom}
          stroke="oklch(90% 0.01 260)" strokeWidth={0.5} strokeDasharray="3,3"
        />
        {/* 折れ線 */}
        <path d={homePath} fill="none" stroke={homeColor} strokeWidth={2} strokeLinejoin="round" />
        <path d={awayPath} fill="none" stroke={awayColor} strokeWidth={2} strokeLinejoin="round" />
        {/* 得点ポイント */}
        {timeline
          .filter((p) => p.type !== "kickoff")
          .map((p, i) => {
            const cx = toX(p.minute);
            const cy = toY(p.team === "home" ? p.homeScore : p.awayScore);
            const color = p.team === "home" ? homeColor : awayColor;
            return (
              <circle
                key={i} cx={cx} cy={cy} r={3} fill={color}
                className="cursor-pointer"
                onMouseEnter={() =>
                  setTooltip({ x: cx, y: cy, text: `${p.minute}' ${p.playerName ?? ""}（${p.type}）` })
                }
                onMouseLeave={() => setTooltip(null)}
              />
            );
          })}
        {/* X軸ラベル */}
        {[0, 20, 40, 60, 80].map((m) => (
          <text key={m} x={toX(m)} y={H - 4} textAnchor="middle" fontSize={9} fill="oklch(45% 0.02 260)">
            {m}'
          </text>
        ))}
        {/* ツールチップ */}
        {tooltip && (
          <g>
            <rect
              x={tooltip.x + 6} y={tooltip.y - 20}
              width={tooltip.text.length * 6 + 8} height={18}
              rx={3} fill="oklch(18% 0.02 260)" opacity={0.85}
            />
            <text x={tooltip.x + 10} y={tooltip.y - 7} fontSize={10} fill="white">
              {tooltip.text}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
```

---

## Task 3 — `MatchEventsSection` への統合

### `components/match-events-section.tsx` を修正

#### props に追加

```tsx
type MatchEventsSectionProps = {
  events: MatchEventRow[];
  homeTeamId: string;
  homeTeamName: string;
  homeTeamSlug: string;
  awayTeamName: string;
  awayTeamSlug: string;
  finalHomeScore: number;  // 追加
  finalAwayScore: number;  // 追加
};
```

#### インポートに追加

```tsx
import { buildScoreTimeline } from "@/lib/format/match-timeline";
import { ScoreGraph } from "@/components/score-graph";
```

#### return 内のイベントリスト上部に挿入

```tsx
const timeline = buildScoreTimeline(events, homeTeamId);

// JSX 内
{timeline.length > 1 && (
  <div className="mb-4">
    <ScoreGraph
      timeline={timeline}
      homeTeamSlug={homeTeamSlug}
      awayTeamSlug={awayTeamSlug}
      finalHomeScore={finalHomeScore}
      finalAwayScore={finalAwayScore}
    />
  </div>
)}
{/* 既存のイベントリスト（変更なし） */}
```

---

## Task 4 — 呼び出し元の更新

`app/matches/[id]/page.tsx` で新 props を渡す:

```tsx
<MatchEventsSection
  events={events}
  homeTeamId={match.homeTeam.id}
  homeTeamName={match.homeTeam.name}
  homeTeamSlug={match.homeTeam.slug}
  awayTeamName={match.awayTeam.name}
  awayTeamSlug={match.awayTeam.slug}
  finalHomeScore={match.homeScore ?? 0}
  finalAwayScore={match.awayScore ?? 0}
/>
```

---

## 完了条件

- [ ] `status === "finished"` かつイベントありの試合でスコア推移グラフが表示される
- [ ] ホーム/アウェイの折れ線がそれぞれのチームカラーで描画される
- [ ] 得点イベントにホバーするとツールチップが表示される（分・選手名・種別）
- [ ] イベントなし（`timeline.length <= 1`）の場合はグラフ非表示
- [ ] Premium 不要（全ユーザーに公開）
- [ ] `pnpm tsc --noEmit` パス
- [ ] `pnpm build` パス

## 変更しないこと

- 既存のイベントリスト（テキスト行）の構造
- `app/matches/[id]/page.tsx` のデータ取得ロジック
- Premium / Free の制御（タイムラインは全ユーザー無料）
