// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StandingsTable } from "@/components/standings-table";

import type { StandingRow } from "@/lib/db/queries/standings";

const standing: StandingRow = {
  bonusPointsLosing: 0,
  bonusPointsTry: 1,
  drawn: 0,
  lost: 1,
  played: 3,
  pointsAgainst: 54,
  pointsFor: 82,
  position: 1,
  teamName: "Ireland",
  teamShortCode: "IRE",
  totalPoints: 13,
  triesFor: 10,
  won: 2,
};

function createStanding(position: number, teamName: string): StandingRow {
  return {
    ...standing,
    position,
    teamName,
    teamShortCode: teamName.slice(0, 3).toUpperCase(),
  };
}

describe("StandingsTable", () => {
  it("renders nothing when no standings are available", () => {
    const { container } = render(<StandingsTable standings={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders standings rows", () => {
    const { container } = render(<StandingsTable standings={[standing]} />);

    expect(screen.getByText("順位表")).toBeInTheDocument();
    expect(screen.getByText("Ireland")).toHaveClass("hidden", "sm:inline");
    expect(screen.getByText("IRE")).toBeInTheDocument();
    expect(screen.getByText("IRE")).toHaveClass("sm:hidden");
    expect(screen.getByText("IRE")).toHaveAttribute("title", "Ireland");
    expect(screen.getByText("82-54")).toBeInTheDocument();
    expect(screen.getByText("13")).toHaveClass(
      "font-display",
      "text-[var(--color-ink)]",
    );
    expect(container.querySelector("section")).toHaveClass(
      "shadow-[var(--shadow-soft)]",
    );
    expect(container.querySelector("tbody tr")).toHaveClass("bg-emerald-50/60");
  });

  it("highlights the teams involved in the current match", () => {
    const { container } = render(
      <StandingsTable highlightedTeams={["Ireland"]} standings={[standing]} />,
    );

    expect(container.querySelector("tbody tr")).toHaveClass(
      "bg-[var(--color-accent-subtle)]",
    );
  });

  it("keeps full standings in collapsed markup while showing a match excerpt", () => {
    render(
      <StandingsTable
        highlightedTeams={["Team 3", "Team 8"]}
        standings={Array.from({ length: 10 }, (_, index) =>
          createStanding(index + 1, `Team ${index + 1}`),
        )}
      />,
    );

    const details = screen.getByText("全順位表を見る").closest("details");

    expect(details).not.toHaveAttribute("open");
    expect(screen.getAllByText("Team 3")).toHaveLength(2);
    expect(screen.getAllByText("Team 8")).toHaveLength(2);
    expect(screen.getByText("Team 10")).toBeInTheDocument();
  });
});
