// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WeekSchedule } from "@/components/calendar/week-schedule";

import type { CalendarMatch } from "@/lib/db/queries/matches";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const baseMatch: CalendarMatch = {
  awayScore: null,
  awayTeam: {
    name: "Kobe Steelers",
    shortCode: "KOB",
    slug: "kobe-steelers",
  },
  competition: {
    family: "league-one",
    name: "Japan Rugby League One",
    season: "2025-26",
    slug: "league-one-2025-26",
  },
  hasContent: false,
  homeScore: null,
  homeTeam: {
    name: "Kubota Spears",
    shortCode: "KUB",
    slug: "kubota-spears",
  },
  id: "match-1",
  kickoffAt: "2026-06-07T15:30:00.000Z",
  poolName: null,
  round: null,
  roundName: null,
  status: "scheduled",
  venue: "National Stadium",
};

describe("WeekSchedule", () => {
  it("groups matches by JST day and links every match page", () => {
    render(
      <WeekSchedule
        matches={[
          {
            ...baseMatch,
            hasContent: true,
            id: "match-1",
            kickoffAt: "2026-06-07T15:30:00.000Z",
          },
          {
            ...baseMatch,
            awayScore: 19,
            homeScore: 24,
            id: "match-2",
            kickoffAt: "2026-06-08T15:00:00.000Z",
            status: "finished",
          },
          {
            ...baseMatch,
            id: "match-3",
            kickoffAt: "2026-06-08T16:00:00.000Z",
            status: "in_progress",
          },
        ]}
      />,
    );

    expect(screen.getByText("2026-06-08 (月)")).toBeInTheDocument();
    expect(screen.getByText("2026-06-08 (月)").closest("section")).toHaveTextContent(
      "1試合",
    );
    expect(screen.getByText("2026-06-09 (火)").closest("section")).toHaveTextContent(
      "2試合",
    );
    expect(screen.getByRole("link", { name: /00:30 JST/ })).toHaveAttribute(
      "href",
      "/matches/match-1",
    );
    expect(screen.getByText("解説")).toBeInTheDocument();
    expect(screen.getByText("24–19")).toBeInTheDocument();
    expect(screen.getByText("ライブ")).toBeInTheDocument();
  });

  it("renders an empty state", () => {
    render(<WeekSchedule emptyMessage="試合なし" matches={[]} />);

    expect(screen.getByText("試合なし")).toBeInTheDocument();
  });
});
