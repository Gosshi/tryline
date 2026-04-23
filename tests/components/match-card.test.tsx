// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MatchCard } from "@/components/match-card";

import type { MatchListItem } from "@/lib/db/queries/matches";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
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
  it("renders a finished scoreline", () => {
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

    expect(screen.getByText("24 - 21")).toBeInTheDocument();
  });

  it("renders an em dash for a scheduled match", () => {
    render(<MatchCard match={baseMatch} />);

    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
