import { describe, expect, it } from "vitest";

import { parseWorldRugbyMatchDetailPayloads } from "@/lib/scrapers/world-rugby-match";

describe("parseWorldRugbyMatchDetailPayloads", () => {
  it("parses lineups and successful scoring events", () => {
    const detail = parseWorldRugbyMatchDetailPayloads(
      {
        teams: [
          {
            teamList: {
              list: [
                {
                  number: "10",
                  player: {
                    id: "p1",
                    name: { display: "Caleb Muntz" },
                  },
                },
                {
                  number: "23",
                  player: {
                    id: "p2",
                    name: { display: "Apisalome Vota" },
                  },
                },
              ],
            },
          },
          {
            teamList: {
              list: [
                {
                  number: "9",
                  player: {
                    id: "p3",
                    name: { display: "Melani Matavao" },
                  },
                },
              ],
            },
          },
        ],
      },
      {
        timeline: [
          {
            points: 5,
            teamIndex: 0,
            time: { secs: 251 },
            type: "T5",
            typeLabel: "Try",
            playerId: "p2",
          },
          {
            points: 2,
            teamIndex: 0,
            time: { secs: 320 },
            type: "C2",
            typeLabel: "Conversion",
            playerId: "p1",
          },
          {
            points: 0,
            teamIndex: 0,
            time: { secs: 380 },
            type: "Miss Con",
            typeLabel: "Missed Conversion",
            playerId: "p1",
          },
          {
            points: 3,
            teamIndex: 1,
            time: { secs: 766 },
            type: "P3",
            typeLabel: "Penalty",
            playerId: "p3",
          },
        ],
      },
    );

    expect(detail.players).toEqual([
      {
        jersey_number: 10,
        player_name: "Caleb Muntz",
        team_side: "home",
      },
      {
        jersey_number: 23,
        player_name: "Apisalome Vota",
        team_side: "home",
      },
      {
        jersey_number: 9,
        player_name: "Melani Matavao",
        team_side: "away",
      },
    ]);
    expect(detail.events).toEqual([
      {
        event_type: "try",
        minute: 4,
        player_name: "Apisalome Vota",
        team_side: "home",
      },
      {
        event_type: "conversion",
        minute: 5,
        player_name: "Caleb Muntz",
        team_side: "home",
      },
      {
        event_type: "penalty",
        minute: 12,
        player_name: "Melani Matavao",
        team_side: "away",
      },
    ]);
  });
});
