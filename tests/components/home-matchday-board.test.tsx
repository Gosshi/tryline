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
  kickoffTimeTbd: false,
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
      />,
    );

    const board = screen.getByLabelText("これからの試合の一覧");

    expect(board).toHaveTextContent("ネーションズチャンピオンシップ 2026");
    expect(board).toHaveTextContent("07-20 (月)19:30 JST");
    expect(
      screen.getByRole("link", { name: /Japan.*Ireland/ }),
    ).toHaveAttribute("href", "/matches/next-match");
    expect(board.querySelector("ul")).toHaveClass("md:grid-cols-2");
    expect(board.querySelector("a")).toHaveAttribute(
      "data-match-layout",
      "row",
    );
  });

  it("omits the board when the week has no matches", () => {
    const { container } = render(
      <HomeMatchdayBoard
        focusMatchId={null}
        matches={[]}
        standingPositions={new Map()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
  it("highlights the focus fixture without moving it ahead of earlier fixtures", () => {
    render(
      <HomeMatchdayBoard
        focusMatchId="focus-second"
        matches={[nextMatch, { ...nextMatch, id: "focus-second" }]}
        standingPositions={new Map()}
      />,
    );
    const links = screen
      .getByLabelText("これからの試合の一覧")
      .querySelectorAll("a");
    expect([...links].map((link) => link.getAttribute("href"))).toEqual([
      "/matches/next-match",
      "/matches/focus-second",
    ]);
    expect(links[1]).toHaveClass("border-l-4");
  });
});
