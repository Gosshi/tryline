"use client";

import { useState } from "react";

import { getTeamColor } from "@/lib/format/team-identity";

import type { ScorePoint } from "@/lib/format/match-timeline";

type ScoreGraphProps = {
  awayTeamName: string;
  awayTeamSlug: string;
  finalAwayScore: number;
  finalHomeScore: number;
  homeTeamName: string;
  homeTeamSlug: string;
  timeline: ScorePoint[];
};

const WIDTH = 560;
const HEIGHT = 120;
const PADDING = { bottom: 20, left: 28, right: 8, top: 8 };

export function ScoreGraph({
  awayTeamName,
  awayTeamSlug,
  finalAwayScore,
  finalHomeScore,
  homeTeamName,
  homeTeamSlug,
  timeline,
}: ScoreGraphProps) {
  const [tooltip, setTooltip] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const maxMinute = Math.max(...timeline.map((point) => point.minute), 80);
  const maxScore = Math.max(finalHomeScore, finalAwayScore, 20) + 5;
  const homeColor = getTeamColor(homeTeamSlug);
  const awayColor = getTeamColor(awayTeamSlug);
  const toX = (minute: number) =>
    PADDING.left +
    (minute / maxMinute) * (WIDTH - PADDING.left - PADDING.right);
  const toY = (score: number) =>
    PADDING.top +
    (1 - score / maxScore) * (HEIGHT - PADDING.top - PADDING.bottom);
  const homePath = timeline
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${toX(point.minute)},${toY(point.homeScore)}`,
    )
    .join(" ");
  const awayPath = timeline
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${toX(point.minute)},${toY(point.awayScore)}`,
    )
    .join(" ");

  return (
    <div className="tl-score-graph relative w-full overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-panel)] px-2 pt-2">
      <svg
        data-tl-motion="chart"
        aria-label="スコア推移グラフ"
        className="w-full"
        role="img"
        style={{ height: "144px" }}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        {[0, Math.round(maxScore / 2), maxScore].map((score) => (
          <g key={score}>
            <line
              stroke="#d8d5ce"
              strokeWidth={0.5}
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={toY(score)}
              y2={toY(score)}
            />
            <text
              fill="#606269"
              fontSize={11}
              textAnchor="end"
              x={PADDING.left - 4}
              y={toY(score) + 4}
            >
              {score}
            </text>
          </g>
        ))}
        <line
          stroke="#d8d5ce"
          strokeDasharray="3,3"
          strokeWidth={0.5}
          x1={toX(80)}
          x2={toX(80)}
          y1={PADDING.top}
          y2={HEIGHT - PADDING.bottom}
        />
        <g data-tl-lines>
          <path
            d={homePath}
            fill="none"
            stroke="#20232a"
            strokeOpacity={0.65}
            strokeWidth={5}
            strokeLinejoin="round"
          />
          <path
            d={awayPath}
            fill="none"
            stroke="#20232a"
            strokeOpacity={0.65}
            strokeWidth={5}
            strokeLinejoin="round"
          />
          <path
            d={homePath}
            fill="none"
            stroke={homeColor}
            strokeLinejoin="round"
            strokeWidth={3}
          />
          <path
            d={awayPath}
            fill="none"
            stroke={awayColor}
            strokeLinejoin="round"
            strokeWidth={3}
          />
          {timeline
            .filter((point) => point.type !== "kickoff")
            .map((point, index) => {
              const cx = toX(point.minute);
              const cy = toY(
                point.team === "home" ? point.homeScore : point.awayScore,
              );
              const color = point.team === "home" ? homeColor : awayColor;

              return (
                <circle
                  className="cursor-pointer"
                  cx={cx}
                  cy={cy}
                  fill={color}
                  key={`${point.minute}-${point.type}-${index}`}
                  onMouseEnter={() =>
                    setTooltip({
                      text: `${point.minute}' ${point.playerName ?? ""}（${point.type}）`,
                      x: cx,
                      y: cy,
                    })
                  }
                  onMouseLeave={() => setTooltip(null)}
                  r={3}
                />
              );
            })}
        </g>
        {[0, 20, 40, 60, 80].map((minute) => (
          <text
            fill="#606269"
            fontSize={11}
            key={minute}
            textAnchor="middle"
            x={toX(minute)}
            y={HEIGHT - 4}
          >
            {`${minute}'`}
          </text>
        ))}
        {tooltip && (
          <g>
            <rect
              fill="#1f2530"
              height={18}
              opacity={0.85}
              rx={3}
              width={tooltip.text.length * 6 + 8}
              x={tooltip.x + 6}
              y={tooltip.y - 20}
            />
            <text
              fill="white"
              fontSize={10}
              x={tooltip.x + 10}
              y={tooltip.y - 7}
            >
              {tooltip.text}
            </text>
          </g>
        )}
      </svg>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--color-rule)] py-3 text-xs text-[var(--color-ink-muted)]">
        {[
          { name: homeTeamName, color: homeColor },
          { name: awayTeamName, color: awayColor },
        ].map(({ name, color }) => (
          <span className="inline-flex items-center gap-2" key={name}>
            <i
              aria-hidden="true"
              className="h-[3px] w-5 border border-[var(--color-ink-muted)]"
              style={{ backgroundColor: color }}
            />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
