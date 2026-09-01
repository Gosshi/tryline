// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  groupMatchesByJstDay,
  groupMatchesByJstTime,
  WeekSchedule,
} from "@/components/calendar/week-schedule";

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
    name: "コベルコ神戸スティーラーズ",
    shortCode: "KOB",
    slug: "kobe-steelers",
  },
  competition: {
    family: "league-one",
    name: "Japan Rugby League One",
    season: "2025-26",
    slug: "league-one-2025-26",
  },
  hasBroadcasts: false,
  hasPreview: false,
  hasRecap: false,
  homeScore: null,
  homeTeam: {
    name: "クボタスピアーズ船橋・東京ベイ",
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

function getDesktopBoard(container: HTMLElement) {
  const board = container.querySelector('[data-testid="calendar-week-board"]');

  if (!board) {
    throw new Error("Calendar week board was not rendered.");
  }

  return board;
}

describe("WeekSchedule grouping", () => {
  it("groups seven simultaneous matches into one kickoff-time group", () => {
    const matches = Array.from({ length: 7 }, (_, index) => ({
      ...baseMatch,
      id: `match-${index}`,
    }));

    const groups = groupMatchesByJstTime(matches);
    const [group] = groups;

    expect(groups).toHaveLength(1);
    expect(group).toBeDefined();
    expect(group?.kickoffTime).toBe("00:30");
    expect(group?.matches.map((match) => match.id)).toEqual([
      "match-0",
      "match-1",
      "match-2",
      "match-3",
      "match-4",
      "match-5",
      "match-6",
    ]);
  });

  it("does not create a day group without a match", () => {
    const groups = groupMatchesByJstDay([baseMatch]);
    const [group] = groups;

    expect(groups).toHaveLength(1);
    expect(group?.key).toBe("2026-06-08");
  });

  it("creates five day groups for matches on five JST dates", () => {
    const groups = groupMatchesByJstDay(
      Array.from({ length: 5 }, (_, index) => ({
        ...baseMatch,
        id: `match-${index}`,
        kickoffAt: `2026-06-${String(7 + index).padStart(2, "0")}T15:30:00.000Z`,
      })),
    );

    expect(groups).toHaveLength(5);
  });
});

describe("WeekSchedule", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps the mobile day list while the desktop board links every match page", () => {
    const { container } = render(
      <WeekSchedule
        highlightMatchId="match-1"
        matches={[
          {
            ...baseMatch,
            hasPreview: true,
            hasRecap: true,
            id: "match-1",
          },
          {
            ...baseMatch,
            awayScore: 19,
            hasPreview: true,
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

    const board = getDesktopBoard(container);
    const mobileSchedule = container.querySelector(".lg\\:hidden");

    expect(board).toHaveTextContent("時刻はすべて日本時間（JST）");
    expect(board).toHaveTextContent("KUB–KOB");
    expect(board).toHaveTextContent(
      "クボタスピアーズ船橋・東京ベイ 対 コベルコ神戸スティーラーズ",
    );
    expect(board.querySelector(".full-name")).not.toHaveClass("truncate");
    expect(board.querySelector(".full-name")).not.toHaveClass(
      "whitespace-nowrap",
    );
    expect(board.querySelectorAll("svg")).toHaveLength(0);
    expect(board.querySelectorAll('a[href="/matches/match-1"]')).toHaveLength(
      1,
    );
    expect(board).toHaveTextContent("24–19");
    expect(board).toHaveTextContent("試合中");
    expect(board).toHaveTextContent("リーグワン");
    expect(board.textContent?.match(/JST/g) ?? []).toHaveLength(1);
    expect(mobileSchedule).toHaveTextContent("National Stadium");
    expect(mobileSchedule).toHaveTextContent("1試合");
    expect(mobileSchedule).toHaveTextContent("2試合");
    expect(screen.getAllByText("レビュー")).toHaveLength(1);
    expect(screen.getAllByText("プレビュー")).toHaveLength(1);
  });

  it("renders a one-match day as a bounded board card instead of a full-width list", () => {
    const { container } = render(<WeekSchedule matches={[baseMatch]} />);
    const board = getDesktopBoard(container);
    const day = board.querySelector('[data-testid="calendar-board-day"]');

    expect(day).toHaveStyle({
      maxWidth: "min(100%, calc(1 * 288px + 0 * 20px))",
      width: "100%",
    });
    expect(day).not.toHaveStyle({ width: "fit-content" });
    expect(
      board.querySelectorAll('[data-testid="calendar-board-match-grid"]'),
    ).toHaveLength(1);
  });

  it("uses the multi-column match grid for a one-day, five-match week", () => {
    const { container } = render(
      <WeekSchedule
        matches={Array.from({ length: 5 }, (_, index) => ({
          ...baseMatch,
          id: `match-${index}`,
        }))}
      />,
    );
    const board = getDesktopBoard(container);
    const day = board.querySelector('[data-testid="calendar-board-day"]');
    const matchGrid = board.querySelector(
      '[data-testid="calendar-board-match-grid"]',
    );

    expect(day).toHaveStyle({
      maxWidth: "min(100%, calc(5 * 288px + 4 * 20px))",
    });
    expect(matchGrid).toHaveClass(
      "[grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]",
    );
    expect(matchGrid).toHaveClass("gap-x-5", "gap-y-0");
    expect(
      board.querySelectorAll('[data-testid="calendar-board-match"]'),
    ).toHaveLength(5);
  });

  it("renders an empty state", () => {
    render(<WeekSchedule emptyMessage="試合なし" matches={[]} />);

    expect(screen.getByText("試合なし")).toBeInTheDocument();
  });

  it("renders broadcast links only for matches with structured broadcasts", () => {
    const { container } = render(
      <WeekSchedule
        matches={[
          {
            ...baseMatch,
            broadcastJpUrl: null,
            hasBroadcasts: true,
            id: "match-1",
          },
          {
            ...baseMatch,
            broadcastJpUrl: "https://example.com/legacy-only",
            hasBroadcasts: false,
            id: "match-2",
          },
        ]}
      />,
    );
    const board = getDesktopBoard(container);
    const broadcastLink = board.querySelector(
      'a[href="/matches/match-1#broadcasts"]',
    );

    expect(broadcastLink).toHaveTextContent("視聴");
    expect(
      board.querySelector('a[href="/matches/match-2#broadcasts"]'),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "https://example.com/legacy-only" }),
    ).not.toBeInTheDocument();
  });

  it("hides finished scores behind spoiler guard until clicked", () => {
    const { container } = render(
      <WeekSchedule
        matches={[
          {
            ...baseMatch,
            awayScore: 19,
            homeScore: 24,
            id: "match-2",
            status: "finished",
          },
        ]}
        spoilerGuardEnabled
      />,
    );
    const board = getDesktopBoard(container);

    expect(board).not.toHaveTextContent("24–19");

    fireEvent.click(board.querySelector('[role="button"]') as HTMLElement);

    expect(board).toHaveTextContent("24–19");
  });
});
