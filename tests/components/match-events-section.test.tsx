// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MatchEventsSection } from "@/components/match-events-section";

import type { MatchEventRow } from "@/lib/db/queries/match-events";

const event: MatchEventRow = {
  id: "00000000-0000-0000-0000-000000000101",
  isPenaltyTry: false,
  minute: 12,
  playerName: "Home Scorer",
  teamId: "home-team",
  type: "try",
};

describe("MatchEventsSection", () => {
  it("renders nothing when no events are available", () => {
    const { container } = render(
      <MatchEventsSection
        awayTeamName="France"
        events={[]}
        homeTeamId="home-team"
        homeTeamName="Ireland"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when only unsupported event types are available", () => {
    const { container } = render(
      <MatchEventsSection
        awayTeamName="France"
        events={[{ ...event, type: "substitution" }]}
        homeTeamId="home-team"
        homeTeamName="Ireland"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("groups scoring events by team and type", () => {
    render(
      <MatchEventsSection
        awayTeamName="France"
        events={[event]}
        homeTeamId="home-team"
        homeTeamName="Ireland"
      />,
    );

    expect(screen.getByText("得点経過")).toBeInTheDocument();
    expect(screen.getAllByText("トライ")).toHaveLength(2);
    expect(screen.getByText("Home Scorer")).toBeInTheDocument();
    expect(screen.getByText("12'")).toBeInTheDocument();
  });
});
