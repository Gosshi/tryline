// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StandingsTable } from "@/components/standings-table";
import { getTeamStripe } from "@/lib/format/team-identity";

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
  teamSlug: "ireland",
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

  it("renders standings rows on a paper surface with team identity", () => {
    const { container } = render(
      <StandingsTable accentColor="#001489" standings={[standing]} />,
    );

    expect(screen.getByText("順位表")).toBeInTheDocument();
    expect(screen.getByText("Ireland")).toHaveClass("hidden", "sm:inline");
    expect(screen.getByText("IRE")).toBeInTheDocument();
    expect(screen.getByText("IRE")).toHaveClass("sm:hidden");
    expect(screen.getByText("IRE")).toHaveAttribute("title", "Ireland");
    expect(screen.getByText("82-54")).toBeInTheDocument();
    expect(screen.getByText("13")).toHaveClass(
      "tabular-nums",
      "font-bold",
      "text-[var(--color-ink)]",
    );
    expect(screen.getByText("13")).not.toHaveClass("font-display");
    expect(container.querySelector("section")).toHaveClass(
      "rounded-sm",
      "border-[var(--color-rule)]",
      "bg-card",
    );
    const teamStripe = container.querySelector(
      "tbody tr td:nth-child(2) [aria-hidden='true']",
    );
    expect(teamStripe).toHaveStyle({ background: getTeamStripe("ireland") });
    expect(container.querySelector("tbody tr")).toHaveStyle({
      backgroundColor: "rgb(0 20 137 / 0.16)",
    });
    expect(screen.getByRole("heading", { name: "順位表" })).toHaveClass(
      "text-[var(--color-brass)]",
    );
  });

  it("fits the hub column with seven columns while keeping full tables unchanged", () => {
    const { container, rerender } = render(
      <StandingsTable
        compact
        standings={[{ ...standing, teamName: "グラスゴー・ウォリアーズ" }]}
      />,
    );
    const table = container.querySelector("table")!;
    expect(table).toHaveClass("table-fixed");
    expect(table).not.toHaveClass("min-w-[34rem]");
    expect(
      [...table.querySelectorAll("th")].map((th) => th.textContent),
    ).toEqual(["#", "チーム", "試", "勝", "分", "敗", "勝点"]);
    expect(table.querySelectorAll("tbody td")).toHaveLength(7);
    expect(table.querySelector("td:last-child")).toHaveTextContent("13");
    expect(table.querySelector("th:nth-child(5)")).not.toHaveClass("hidden");
    rerender(<StandingsTable standings={[standing]} />);
    expect(container.querySelector("table")).toHaveClass("min-w-[34rem]");
    expect(container.querySelectorAll("th")).toHaveLength(9);
    expect(container.querySelector("tbody")).toHaveTextContent("82-54");
  });

  it("uses three rank tint levels and leaves fifth place untinted", () => {
    const { container } = render(
      <StandingsTable
        accentColor="#001489"
        standings={[
          createStanding(1, "Team 1"),
          createStanding(3, "Team 3"),
          createStanding(4, "Team 4"),
          createStanding(5, "Team 5"),
        ]}
      />,
    );
    const rows = container.querySelectorAll("tbody tr");

    expect(rows[0]).toHaveStyle({ backgroundColor: "rgb(0 20 137 / 0.16)" });
    expect(rows[1]).toHaveStyle({ backgroundColor: "rgb(0 20 137 / 0.09)" });
    expect(rows[2]).toHaveStyle({
      backgroundColor: "rgb(0 20 137 / 0.045)",
    });
    expect(rows[3]).not.toHaveAttribute("style");
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
    expect(screen.getAllByText("Team 3").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Team 8").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Team 10")).toBeInTheDocument();
    expect(
      screen.getByLabelText("省略された順位があります"),
    ).toBeInTheDocument();
  });
});
