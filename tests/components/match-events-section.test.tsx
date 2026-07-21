// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MatchEventsSection } from "@/components/match-events-section";

import type { MatchEventRow } from "@/lib/db/queries/match-events";

const event: MatchEventRow = {
  id: "00000000-0000-0000-0000-000000000101",
  isPenaltyTry: false,
  minute: 12,
  playerName: "Home Scorer",
  points: null,
  teamId: "home-team",
  type: "try",
};

afterEach(() => {
  cleanup();
});

describe("MatchEventsSection", () => {
  it("renders nothing when no events are available", () => {
    const { container } = render(
      <MatchEventsSection
        awayTeamName="France"
        awayTeamSlug="france"
        events={[]}
        finalAwayScore={0}
        finalHomeScore={0}
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
        finalAwayScore={3}
        finalHomeScore={5}
        homeTeamId="home-team"
        homeTeamName="Ireland"
        homeTeamSlug="ireland"
        variant="timeline"
      />,
    );

    expect(screen.getByText("得点推移")).toBeInTheDocument();
    expect(screen.queryByText("Scoring Timeline")).not.toBeInTheDocument();
    expect(screen.getByText("Home Scorer トライ")).toBeInTheDocument();
    expect(
      screen.getByText("Away Kicker ペナルティゴール"),
    ).toBeInTheDocument();
    expect(screen.getByText("12'")).toBeInTheDocument();
    expect(screen.getByText("23'")).toBeInTheDocument();
  });

  it("links an event scorer only when a player link is resolved", () => {
    render(
      <MatchEventsSection
        awayTeamName="France"
        awayTeamSlug="france"
        events={[event]}
        finalAwayScore={0}
        finalHomeScore={5}
        homeTeamId="home-team"
        homeTeamName="Ireland"
        homeTeamSlug="ireland"
        playerLinks={{ "00000000-0000-0000-0000-000000000101": "home-scorer" }}
        variant="timeline"
      />,
    );

    expect(screen.getByRole("link", { name: "Home Scorer" })).toHaveAttribute(
      "href",
      "/players/home-scorer",
    );
  });

  it("shows a no-score note for a team without events", () => {
    render(
      <MatchEventsSection
        awayTeamName="France"
        awayTeamSlug="france"
        events={[event]}
        finalAwayScore={0}
        finalHomeScore={5}
        homeTeamId="home-team"
        homeTeamName="Ireland"
        homeTeamSlug="ireland"
        variant="timeline"
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
        finalAwayScore={3}
        finalHomeScore={5}
        homeTeamId="home-team"
        homeTeamName="Ireland"
        homeTeamSlug="ireland"
        variant="timeline"
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
        finalAwayScore={3}
        finalHomeScore={5}
        homeTeamId="home-team"
        homeTeamName="Ireland"
        homeTeamSlug="ireland"
        variant="timeline"
      />,
    );

    const rows = container.querySelectorAll(
      ".grid-cols-\\[1fr_2\\.5rem_1fr\\]",
    );

    expect(rows[1]).not.toHaveStyle({
      paddingLeft: "8px",
    });
    expect(rows[2]).not.toHaveStyle({
      paddingRight: "8px",
    });
    expect(rows[1]?.children[0]).toHaveStyle({
      borderLeft: "3px solid #009A44",
      paddingLeft: "8px",
    });
    expect(rows[2]?.children[2]).toHaveStyle({
      borderRight: "3px solid #002395",
      paddingRight: "8px",
    });
  });

  it("renders a score graph and tooltip for scoring events", () => {
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
        finalAwayScore={3}
        finalHomeScore={5}
        homeTeamId="home-team"
        homeTeamName="Ireland"
        homeTeamSlug="ireland"
        variant="timeline"
      />,
    );
    const section = within(container);

    expect(
      section.getByRole("img", { name: "スコア推移グラフ" }),
    ).toBeInTheDocument();

    const points = container.querySelectorAll("circle");
    expect(points).toHaveLength(2);
    fireEvent.mouseEnter(points[0]!);
    expect(section.getByText("12' Home Scorer（try）")).toBeInTheDocument();
  });

  it("does not render the score graph for non-scoring events only", () => {
    const { container } = render(
      <MatchEventsSection
        awayTeamName="France"
        awayTeamSlug="france"
        events={[
          {
            ...event,
            type: "yellow_card",
          },
        ]}
        finalAwayScore={0}
        finalHomeScore={0}
        homeTeamId="home-team"
        homeTeamName="Ireland"
        homeTeamSlug="ireland"
        variant="timeline"
      />,
    );
    const section = within(container);

    expect(
      section.queryByRole("img", { name: "スコア推移グラフ" }),
    ).not.toBeInTheDocument();
  });

  it("renders the deterministic key moment and event-derived chips", () => {
    render(
      <MatchEventsSection
        awayTeamName="France"
        awayTeamSlug="france"
        events={[
          event,
          {
            ...event,
            id: "away-yellow",
            minute: 26,
            playerName: "Away Player",
            teamId: "away-team",
            type: "yellow_card",
          },
        ]}
        finalAwayScore={0}
        finalHomeScore={5}
        homeTeamId="home-team"
        homeTeamName="Ireland"
        homeTeamSlug="ireland"
      />,
    );

    expect(screen.getByText("この試合の要点")).toBeInTheDocument();
    expect(screen.getByText("リードを奪った得点")).toBeInTheDocument();
    expect(screen.getByText("前半の最大リード")).toBeInTheDocument();
    expect(screen.getByText("イエローカード")).toBeInTheDocument();
  });

  it("hides the primary key moment when event scores are incomplete", () => {
    render(
      <MatchEventsSection
        awayTeamName="France"
        awayTeamSlug="france"
        events={[event]}
        finalAwayScore={0}
        finalHomeScore={12}
        homeTeamId="home-team"
        homeTeamName="Ireland"
        homeTeamSlug="ireland"
      />,
    );

    expect(screen.queryByText("リードを奪った得点")).not.toBeInTheDocument();
    expect(screen.getByText("前半の最大リード")).toBeInTheDocument();
  });
});
