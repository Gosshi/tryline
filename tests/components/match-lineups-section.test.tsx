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
  playerSlug: null,
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
    expect(screen.queryByText("Team Sheets")).not.toBeInTheDocument();
    expect(screen.getAllByText("10")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Starting Fly-half")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Fly-half")[0]).toBeInTheDocument();
  });

  it("links lineup players when a player slug is available", () => {
    render(
      <MatchLineupsSection
        awayTeamName="France"
        homeTeamId="home-team"
        homeTeamName="Ireland"
        players={[{ ...player, playerSlug: "starting-fly-half" }]}
      />,
    );

    expect(
      screen.getAllByRole("link", { name: "Starting Fly-half" })[0],
    ).toHaveAttribute("href", "/players/starting-fly-half");
  });

  it("renders a bench divider when replacements are available", () => {
    render(
      <MatchLineupsSection
        awayTeamName="France"
        homeTeamId="home-team"
        homeTeamName="Ireland"
        players={[player, { ...player, isStarter: false, jerseyNumber: 21 }]}
      />,
    );

    expect(screen.getAllByText("控え")[0]).toBeInTheDocument();
  });
});