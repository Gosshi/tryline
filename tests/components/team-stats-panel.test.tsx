// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TeamStatsPanel } from "@/components/team-stats-panel";

describe("TeamStatsPanel", () => {
  it("uses the compact Japanese name display for top scorers", () => {
    render(
      <TeamStatsPanel
        record={{
          draws: 0,
          form: [],
          losses: 0,
          matchCount: 0,
          pointsAgainst: 0,
          pointsFor: 0,
          wins: 0,
        }}
        scoring={{
          matchCount: 1,
          penaltyGoalsPerMatch: 0,
          pointsForPerMatch: 5,
          triesPerMatch: 1,
        }}
        topScorers={[
          {
            conversions: 0,
            penalties: 0,
            playerName: "齋藤 直人",
            points: 5,
            tries: 1,
          },
        ]}
      />,
    );

    expect(screen.getByText("齋藤直人")).toBeInTheDocument();
    expect(screen.queryByText("齋藤 直人")).not.toBeInTheDocument();
  });
});
