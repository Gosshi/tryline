// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MatchHeader } from "@/components/match-header";

import type { MatchDetail } from "@/lib/db/queries/matches";

const match: MatchDetail = {
  awayScore: null,
  awayTeam: {
    englishName: null,
    name: "France",
    shortCode: "FRA",
    slug: "france",
  },
  awayTeamId: "00000000-0000-0000-0000-000000000003",
  competition: {
    family: "six-nations",
    name: "Six Nations 2027",
    season: "2027",
    slug: "six-nations-2027",
  },
  homeScore: null,
  homeTeam: {
    englishName: null,
    name: "Ireland",
    shortCode: "IRL",
    slug: "ireland",
  },
  homeTeamId: "00000000-0000-0000-0000-000000000002",
  id: "00000000-0000-0000-0000-000000000001",
  kickoffAt: "2027-02-06T15:00:00.000Z",
  round: 1,
  roundName: null,
  status: "scheduled",
  venue: "Aviva Stadium",
};

afterEach(() => {
  cleanup();
});

describe("MatchHeader", () => {
  it("renders one screen-reader-only h1 for the match name", () => {
    const { container } = render(<MatchHeader match={match} />);

    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Ireland vs France",
      }),
    ).toHaveClass("sr-only", "font-heading");
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
    const homeCode = header.getByText("IRL");
    const awayCode = header.getByText("FRA");

    expect(homeCode).toHaveClass("shrink-0");
    expect(homeCode.parentElement).toHaveClass(
      "inline-flex",
      "shrink-0",
      "items-center",
      "flex-row-reverse",
    );
    expect(homeCode.closest("p")).toHaveClass(
      "flex",
      "min-w-0",
      "items-center",
      "justify-end",
    );
    expect(awayCode).toHaveClass("shrink-0");
    expect(awayCode.parentElement).toHaveClass(
      "inline-flex",
      "shrink-0",
      "items-center",
      "flex-row",
    );
    expect(awayCode.closest("p")).toHaveClass(
      "flex",
      "min-w-0",
      "items-center",
    );
    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });

  it("shows a YouTube highlight search link only for finished matches", () => {
    const { rerender } = render(<MatchHeader match={match} />);

    expect(
      screen.queryByRole("link", {
        name: "YouTube でハイライトを検索",
      }),
    ).not.toBeInTheDocument();

    rerender(
      <MatchHeader
        match={{
          ...match,
          awayScore: 28,
          homeScore: 31,
          status: "finished",
        }}
      />,
    );

    expect(
      screen.getByRole("link", {
        name: "YouTube でハイライトを検索",
      }),
    ).toHaveAttribute(
      "href",
      "https://www.youtube.com/results?search_query=Ireland%20vs%20France%202027%20highlights",
    );
  });

  it("renders an H2H link when a stored matchup URL is provided", () => {
    render(
      <MatchHeader headToHeadHref="/h2h/france-vs-ireland" match={match} />,
    );

    expect(
      screen.getByRole("link", { name: "両者の対戦成績" }),
    ).toHaveAttribute("href", "/h2h/france-vs-ireland");
  });

  it("uses display name overrides for EN pages", () => {
    render(
      <MatchHeader
        awayDisplayName="Les Bleus"
        homeDisplayName="Irish Rugby"
        match={{
          ...match,
          awayScore: 28,
          homeScore: 31,
          status: "finished",
        }}
      />,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Irish Rugby vs Les Bleus",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Irish Rugby" })).toHaveAttribute(
      "href",
      "/teams/ireland",
    );
    expect(
      screen.getByRole("link", {
        name: "YouTube でハイライトを検索",
      }),
    ).toHaveAttribute(
      "href",
      "https://www.youtube.com/results?search_query=Irish%20Rugby%20vs%20Les%20Bleus%202027%20highlights",
    );
  });

  it("formats round zero as a playoff qualifier in the subtitle", () => {
    render(
      <MatchHeader
        match={{
          ...match,
          round: 0,
        }}
      />,
    );

    expect(
      screen.getByText(/Six Nations 2027 · プレーオフ予選/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Round 0/)).not.toBeInTheDocument();
  });

  it("formats standard rounds as Japanese round labels in the subtitle", () => {
    render(<MatchHeader match={match} />);

    expect(
      screen.getAllByText(/Six Nations 2027 · 第1節/).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/Round 1/)).not.toBeInTheDocument();
  });

  it("allows long team names to wrap on mobile", () => {
    render(
      <MatchHeader
        match={{
          ...match,
          awayTeam: {
            ...match.awayTeam,
            name: "Northampton Saints RFC Extended Name",
          },
        }}
      />,
    );

    expect(
      screen.getByText("Northampton Saints RFC Extended Name"),
    ).toHaveClass(
      "max-w-[9rem]",
      "whitespace-normal",
      "break-words",
      "sm:truncate",
    );
  });

  it("links both team names to the new team pages", () => {
    render(<MatchHeader match={match} />);

    expect(screen.getAllByRole("link", { name: "Ireland" })[0]).toHaveAttribute(
      "href",
      "/teams/ireland",
    );
    expect(screen.getAllByRole("link", { name: "France" })[0]).toHaveAttribute(
      "href",
      "/teams/france",
    );
  });
});
