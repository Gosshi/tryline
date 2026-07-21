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

  it("renders next-match actions instead of an empty board", () => {
    render(
      <HomeMatchdayBoard
        focusMatchId={null}
        matches={[]}
        nextUpcomingMatch={nextMatch}
        standingPositions={new Map()}
        weekLabel="7月第3週"
      />,
    );

    const board = screen.getByLabelText("次の試合");

    expect(board).toHaveTextContent("ネーションズチャンピオンシップ 2026");
    expect(board).toHaveTextContent("2026-07-20 (月) 19:30 JST");
    expect(screen.getByRole("link", { name: "Japan" })).toHaveAttribute(
      "href",
      "/teams/japan",
    );
    expect(screen.getByRole("link", { name: "Ireland" })).toHaveAttribute(
      "href",
      "/teams/ireland",
    );
    expect(
      screen.getByRole("link", { name: "通知設定を開く" }),
    ).toHaveAttribute("href", "/?notifications=open");
  });

  it("hides the alternate card when no future match exists", () => {
    const { container } = render(
      <HomeMatchdayBoard
        focusMatchId={null}
        matches={[]}
        nextUpcomingMatch={null}
        standingPositions={new Map()}
        weekLabel="7月第3週"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
