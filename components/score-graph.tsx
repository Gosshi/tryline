"use client";

import { useState } from "react";

import { getTeamColor } from "@/lib/format/team-identity";

import type { ScorePoint } from "@/lib/format/match-timeline";

type ScoreGraphProps = {
  awayTeamSlug: string;
  finalAwayScore: number;
  finalHomeScore: number;
  homeTeamSlug: string;
  timeline: ScorePoint[];
};

const WIDTH = 560;
const HEIGHT = 120;
const PADDING = { bottom: 20, left: 28, right: 8, top: 8 };

export function ScoreGraph({
  awayTeamSlug,
  finalAwayScore,
  finalHomeScore,
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
    <div className="relative w-full">
      <svg
        aria-label="スコア推移グラフ"
        className="w-full"
        role="img"
        style={{ height: "144px" }}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        {[0, Math.round(maxScore / 2), maxScore].map((score) => (
          <g key={score}>
            <line
              stroke="oklch(90% 0.01 260)"
              strokeWidth={0.5}
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={toY(score)}
              y2={toY(score)}
            />
            <text
              fill="oklch(45% 0.02 260)"
              fontSize={9}
              textAnchor="end"
              x={PADDING.left - 4}
              y={toY(score) + 4}
            >
              {score}
            </text>
          </g>
        ))}
        <line
          stroke="oklch(90% 0.01 260)"
          strokeDasharray="3,3"
          strokeWidth={0.5}
          x1={toX(80)}
          x2={toX(80)}
          y1={PADDING.top}
          y2={HEIGHT - PADDING.bottom}
        />
        <path
          d={homePath}
          fill="none"
          stroke={homeColor}
          strokeLinejoin="round"
          strokeWidth={2}
        />
        <path
          d={awayPath}
          fill="none"
          stroke={awayColor}
          strokeLinejoin="round"
          strokeWidth={2}
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
        {[0, 20, 40, 60, 80].map((minute) => (
          <text
            fill="oklch(45% 0.02 260)"
            fontSize={9}
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
              fill="oklch(18% 0.02 260)"
              height={18}
              opacity={0.85}
              rx={3}
              width={tooltip.text.length * 6 + 8}
              x={tooltip.x + 6}
              y={tooltip.y - 20}
            />
            <text fill="white" fontSize={10} x={tooltip.x + 10} y={tooltip.y - 7}>
              {tooltip.text}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
