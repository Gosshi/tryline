import { describe, expect, it } from "vitest";

import {
  parseWorldRugbySchedulePayload,
  parseWorldRugbyTournamentId,
} from "@/lib/scrapers/world-rugby-schedule";

describe("parseWorldRugbySchedulePayload", () => {
  it("parses completed World Rugby schedule matches", () => {
    const entries = parseWorldRugbySchedulePayload(
      {
        event: {
          label: "Pacific Nations Cup 2024",
        },
        matches: [
          {
            description: "Match 1",
            matchId: "match-1",
            scores: [42, 16],
            status: "C",
            teams: [{ name: "Fiji" }, { name: "Samoa" }],
            time: { millis: 1724392800000 },
            venue: {
              city: "Suva",
              country: "Fiji",
              name: "HFC Bank Stadium",
            },
          },
          {
            description: "Match 2",
            matchId: "future-match",
            scores: [0, 0],
            status: "U",
            teams: [{ name: "Japan" }, { name: "Canada" }],
            time: { millis: 1725000000000 },
          },
        ],
      },
      "2024",
    );

    expect(entries).toEqual([
      {
        away_score: 16,
        away_team_slug: "samoa",
        competition_family: "pnc",
        home_score: 42,
        home_team_slug: "fiji",
        kickoff_at: "2024-08-23T06:00:00.000Z",
        match_url: "https://www.world.rugby/match/match-1",
        round: 1,
        season: "2024",
        venue: "HFC Bank Stadium, Suva, Fiji",
        world_rugby_match_id: "match-1",
      },
    ]);
  });
});

describe("parseWorldRugbyTournamentId", () => {
  it("extracts the schedule widget tournament id", () => {
    expect(
      parseWorldRugbyTournamentId(`
        <section
          data-widget="schedule/match-list-root"
          data-tournament-id="735a21a5-9069-4fad-810e-81806f9c47a4"
        ></section>
      `),
    ).toBe("735a21a5-9069-4fad-810e-81806f9c47a4");
  });
});
