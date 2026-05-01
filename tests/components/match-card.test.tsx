// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MatchCard } from "@/components/match-card";

import type { MatchListItem } from "@/lib/db/queries/matches";

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

const baseMatch: MatchListItem = {
  awayScore: null,
  awayTeam: {
    name: "France",
    shortCode: "FRA",
    slug: "france",
  },
  homeScore: null,
  homeTeam: {
    name: "Ireland",
    shortCode: "IRL",
    slug: "ireland",
  },
  id: "00000000-0000-0000-0000-000000000001",
  kickoffAt: "2027-02-05T20:15:00.000Z",
  round: 1,
  status: "scheduled",
  venue: "Aviva Stadium",
};

describe("MatchCard", () => {
  it("renders a finished scoreline and dims the losing team", () => {
    render(
      <MatchCard
        match={{
          ...baseMatch,
          awayScore: 21,
          homeScore: 24,
          status: "finished",
        }}
      />,
    );

    expect(screen.getByText("24")).toHaveClass("text-slate-950");
    expect(screen.getByText("21")).toHaveClass("text-slate-400");
    expect(screen.getByText("FRA 🇫🇷")).toHaveClass("text-slate-400");
    expect(screen.getByText("Ireland")).toHaveClass("text-slate-900");
  });

  it("renders an em dash for a scheduled match", () => {
    render(<MatchCard match={baseMatch} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("hides the status badge for a finished match", () => {
    render(
      <MatchCard
        match={{
          ...baseMatch,
          awayScore: 21,
          homeScore: 24,
          status: "finished",
        }}
      />,
    );

    expect(screen.queryByText("終了")).not.toBeInTheDocument();
  });

  it.each([
    ["scheduled", "キックオフ予定"],
    ["in_progress", "試合中"],
    ["postponed", "延期"],
    ["cancelled", "中止"],
  ] as const)("shows the status badge for %s matches", (status, label) => {
    const { container } = render(<MatchCard match={{ ...baseMatch, status }} />);
    const card = within(container);

    expect(card.getByText(label)).toBeInTheDocument();
  });

  it("uses mobile-friendly short-code sizing while preserving desktop sizing", () => {
    const { container } = render(<MatchCard match={baseMatch} />);
    const card = within(container);

    expect(card.getByText("🇮🇪 IRL")).toHaveClass(
      "truncate",
      "text-base",
      "sm:text-xl",
    );
    expect(card.getByText("FRA 🇫🇷")).toHaveClass(
      "truncate",
      "text-base",
      "sm:text-xl",
    );
  });

  it("uses the home team color for the left border", () => {
    const { container } = render(<MatchCard match={baseMatch} />);

    expect(container.querySelector("article")).toHaveStyle({
      borderLeftColor: "#009A44",
    });
  });
});
