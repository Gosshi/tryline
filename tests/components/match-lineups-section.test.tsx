// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MatchLineupsSection } from "@/components/match-lineups-section";

import type { MatchLineupPlayer } from "@/lib/db/queries/match-lineups";

const player: MatchLineupPlayer = {
  isStarter: true,
  jerseyNumber: 10,
  playerName: "Starting Fly-half",
  position: "Fly-half",
  teamId: "home-team",
};

describe("MatchLineupsSection", () => {
  it("renders nothing when no lineup data is available", () => {
    const { container } = render(
      <MatchLineupsSection
        awayTeamName="France"
        homeTeamId="home-team"
        homeTeamName="Ireland"
        players={[]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders starters with jersey numbers and positions", () => {
    render(
      <MatchLineupsSection
        awayTeamName="France"
        homeTeamId="home-team"
        homeTeamName="Ireland"
        players={[player]}
      />,
    );

    expect(screen.getByText("出場選手")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Starting Fly-half")).toBeInTheDocument();
    expect(screen.getByText("Fly-half")).toBeInTheDocument();
  });
});
