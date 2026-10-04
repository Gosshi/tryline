// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  getNextMatchCountdownLabel,
  HomeMatchdayBoard,
} from "@/components/home-matchday-board";

const nextMatch = {
  awayScore: null,
  awayTeam: {
    id: "away-id",
    name: "Ireland",
    shortCode: "IRE",
    slug: "ireland",
    worldRanking: 2,
  },
  competition: {
    family: "nations-championship",
    id: "nations-championship-2026-id",
    name: "Nations Championship",
    season: "2026",
    slug: "nations-championship-2026",
  },
  hasBroadcasts: false,
  hasPreview: false,
  hasRecap: false,
  homeScore: null,
  homeTeam: {
    id: "home-id",
    name: "Japan",
    shortCode: "JPN",
    slug: "japan",
    worldRanking: 13,
  },
  id: "next-match",
  kickoffAt: "2026-07-20T10:30:00.000Z",
  poolName: null,
  round: null,
  roundName: null,
  status: "scheduled" as const,
  venue: null,
};

describe("HomeMatchdayBoard", () => {
  afterEach(() => {
    cleanup();
  });

  it("uses JST calendar days for natural countdown labels", () => {
    expect(
      getNextMatchCountdownLabel(
        "2026-07-17T15:30:00.000Z",
        new Date("2026-07-17T14:30:00.000Z"),
      ),
    ).toBe("次の試合は明日");
    expect(
      getNextMatchCountdownLabel(
        "2026-07-17T14:45:00.000Z",
        new Date("2026-07-17T14:30:00.000Z"),
      ),
    ).toBe("次の試合は今日");
    expect(
      getNextMatchCountdownLabel(
        "2026-07-20T10:30:00.000Z",
        new Date("2026-07-17T03:00:00.000Z"),
      ),
    ).toBe("次の試合まであと3日");
  });

  it("renders current-week fixtures in a left-aligned two-column board", () => {
    render(
      <HomeMatchdayBoard
        focusMatchId={null}
        matches={[nextMatch]}
        standingPositions={new Map()}
        weekLabel="7月第3週"
      />,
    );

    const board = screen.getByLabelText("今週の注目試合");

    expect(board).toHaveTextContent("ネーションズチャンピオンシップ 2026");
    expect(board).toHaveTextContent("2026-07-20 (月) 19:30 JST");
    expect(
      screen.getByRole("link", { name: /Japan.*Ireland/ }),
    ).toHaveAttribute("href", "/matches/next-match");
    expect(board.querySelector("ul")).toHaveClass("lg:grid-cols-2");
  });

  it("omits the board when the week has no matches", () => {
    const { container } = render(
      <HomeMatchdayBoard
        focusMatchId={null}
        matches={[]}
        standingPositions={new Map()}
        weekLabel="7月第3週"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
