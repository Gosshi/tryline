// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MatchHeader } from "@/components/match-header";

import type { MatchDetail } from "@/lib/db/queries/matches";

const match: MatchDetail = {
  awayScore: null,
  awayTeam: {
    name: "France",
    shortCode: "FRA",
    slug: "france",
  },
  awayTeamId: "00000000-0000-0000-0000-000000000003",
  competition: {
    name: "Six Nations 2027",
    season: "2027",
    slug: "six-nations-2027",
  },
  homeScore: null,
  homeTeam: {
    name: "Ireland",
    shortCode: "IRL",
    slug: "ireland",
  },
  homeTeamId: "00000000-0000-0000-0000-000000000002",
  id: "00000000-0000-0000-0000-000000000001",
  kickoffAt: "2027-02-06T15:00:00.000Z",
  round: 1,
  status: "scheduled",
  venue: "Aviva Stadium",
};

describe("MatchHeader", () => {
  it("renders one screen-reader-only h1 for the match name", () => {
    const { container } = render(<MatchHeader match={match} />);

    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Ireland vs France",
      }),
    ).toHaveClass("sr-only");
  });

  it("uses a sharp home-away color bar at the top", () => {
    const { container } = render(<MatchHeader match={match} />);
    const colorBar = container.querySelector("[aria-hidden='true']");

    expect(colorBar).toHaveClass("absolute", "inset-x-0", "top-0", "h-[4px]");
    expect(colorBar).toHaveStyle({
      background: "linear-gradient(to right, #009A44 50%, #002395 50%)",
    });
  });

  it("renders SVG flags with the team short codes", () => {
    const { container } = render(<MatchHeader match={match} />);
    const header = within(container);

    expect(header.getByText("IRL")).toHaveClass(
      "flex",
      "items-center",
      "flex-row-reverse",
    );
    expect(header.getByText("FRA")).toHaveClass("flex", "items-center");
    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });
});
