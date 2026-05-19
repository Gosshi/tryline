// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KnockoutBracket } from "@/components/knockout-bracket";

import type { MatchListItem } from "@/lib/db/queries/matches";

function buildMatch(
  id: string,
  round: number,
  status: MatchListItem["status"],
): MatchListItem {
  return {
    awayScore: status === "finished" ? 19 : null,
    awayTeam: { name: `Away ${id}`, shortCode: `A${id}`, slug: `away-${id}` },
    homeScore: status === "finished" ? 24 : null,
    homeTeam: { name: `Home ${id}`, shortCode: `H${id}`, slug: `home-${id}` },
    id,
    kickoffAt: `2027-10-${String(round).padStart(2, "0")}T08:00:00.000Z`,
    round,
    roundName: null,
    status,
    venue: null,
  };
}

describe("KnockoutBracket", () => {
  it("renders finished matches and TBD placeholders for missing slots", () => {
    render(
      <KnockoutBracket
        matches={[
          buildMatch("qf-1", 5, "finished"),
          buildMatch("sf-1", 6, "scheduled"),
          buildMatch("final", 8, "scheduled"),
        ]}
      />,
    );

    expect(
      screen.getByRole("link", { name: /Hqf-1 vs Aqf-1/i }),
    ).toHaveAttribute("href", "/matches/qf-1");
    expect(screen.getByText("24 – 19")).toBeInTheDocument();
    expect(screen.getByText("FT")).toBeInTheDocument();
    expect(screen.getAllByText("TBD").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("heading", { name: "準々決勝" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "決勝" })).toBeInTheDocument();
  });
});
