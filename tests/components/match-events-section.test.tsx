// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen, within } from "@testing-library/react";
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
        awayTeamSlug="france"
        events={[]}
        homeTeamId="home-team"
        homeTeamName="Ireland"
        homeTeamSlug="ireland"
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders scoring events in minute order by team side", () => {
    render(
      <MatchEventsSection
        awayTeamName="France"
        awayTeamSlug="france"
        events={[
          {
            ...event,
            id: "00000000-0000-0000-0000-000000000102",
            minute: 23,
            playerName: "Away Kicker",
            teamId: "away-team",
            type: "penalty_goal",
          },
          event,
        ]}
        homeTeamId="home-team"
        homeTeamName="Ireland"
        homeTeamSlug="ireland"
      />,
    );

    expect(screen.getByText("得点経過")).toBeInTheDocument();
    expect(screen.getByText("Home Scorer トライ")).toBeInTheDocument();
    expect(
      screen.getByText("Away Kicker ペナルティゴール"),
    ).toBeInTheDocument();
    expect(screen.getByText("12'")).toBeInTheDocument();
    expect(screen.getByText("23'")).toBeInTheDocument();
  });

  it("shows a no-score note for a team without events", () => {
    render(
      <MatchEventsSection
        awayTeamName="France"
        awayTeamSlug="france"
        events={[event]}
        homeTeamId="home-team"
        homeTeamName="Ireland"
        homeTeamSlug="ireland"
      />,
    );

    expect(screen.getByText("France: 得点なし")).toBeInTheDocument();
  });

  it("does not show a no-score note when both teams have events", () => {
    const { container } = render(
      <MatchEventsSection
        awayTeamName="France"
        awayTeamSlug="france"
        events={[
          event,
          {
            ...event,
            id: "00000000-0000-0000-0000-000000000102",
            minute: 23,
            playerName: "Away Kicker",
            teamId: "away-team",
            type: "penalty_goal",
          },
        ]}
        homeTeamId="home-team"
        homeTeamName="Ireland"
        homeTeamSlug="ireland"
      />,
    );
    const section = within(container);

    expect(section.queryByText(/得点なし/)).not.toBeInTheDocument();
  });

  it("uses team color bars on the scoring side", () => {
    const { container } = render(
      <MatchEventsSection
        awayTeamName="France"
        awayTeamSlug="france"
        events={[
          event,
          {
            ...event,
            id: "00000000-0000-0000-0000-000000000102",
            minute: 23,
            playerName: "Away Kicker",
            teamId: "away-team",
            type: "penalty_goal",
          },
        ]}
        homeTeamId="home-team"
        homeTeamName="Ireland"
        homeTeamSlug="ireland"
      />,
    );

    const rows = container.querySelectorAll(".grid-cols-\\[1fr_2\\.5rem_1fr\\]");

    expect(rows[1]).toHaveStyle({
      borderLeft: "3px solid #009A44",
      paddingLeft: "8px",
    });
    expect(rows[2]).toHaveStyle({
      borderRight: "3px solid #002395",
      paddingRight: "8px",
    });
  });
});
