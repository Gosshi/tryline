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

describe("StandingsTable", () => {
  it("renders nothing when no standings are available", () => {
    const { container } = render(<StandingsTable standings={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders standings rows", () => {
    const { container } = render(<StandingsTable standings={[standing]} />);

    expect(screen.getByText("順位表")).toBeInTheDocument();
    expect(screen.getByText("IRE")).toBeInTheDocument();
    expect(screen.getByText("82-54")).toBeInTheDocument();
    expect(screen.getByText("13")).toHaveClass(
      "font-display",
      "text-[var(--color-ink)]",
    );
    expect(container.querySelector("section")).toHaveClass("shadow-sm");
    expect(container.querySelector("tbody tr")).toHaveClass(
      "bg-emerald-50/60",
    );
  });
});
