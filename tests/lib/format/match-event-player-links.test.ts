import { describe, expect, it } from "vitest";

import { buildMatchEventPlayerLinks } from "@/lib/format/match-event-player-links";

import type { MatchEventRow } from "@/lib/db/queries/match-events";
import type { MatchLineupPlayer } from "@/lib/db/queries/match-lineups";

const event: MatchEventRow = {
  id: "event-1",
  isPenaltyTry: false,
  minute: 12,
  playerName: "Matsunaga",
  points: null,
  teamId: "home-team",
  type: "try",
};

const player: MatchLineupPlayer = {
  isStarter: true,
  jerseyNumber: 15,
  playerName: "Takuro Matsunaga",
  playerSlug: "takuro-matsunaga",
  position: "FB",
  teamId: "home-team",
};

describe("buildMatchEventPlayerLinks", () => {
  it("links an event scorer to a matching player on the same team", () => {
    expect(buildMatchEventPlayerLinks([event], [player])).toEqual({
      "event-1": "takuro-matsunaga",
    });
  });

  it("leaves unmatched scorers and empty lineups unlinked", () => {
    expect(
      buildMatchEventPlayerLinks(
        [{ ...event, playerName: "Unknown" }],
        [player],
      ),
    ).toEqual({});
    expect(buildMatchEventPlayerLinks([event], [])).toEqual({});
  });

  it("does not link to a same-named player from the other team", () => {
    expect(
      buildMatchEventPlayerLinks(
        [{ ...event, playerName: "Smith" }],
        [
          { ...player, playerName: "Home Player", playerSlug: "home-player" },
          {
            ...player,
            playerName: "Ben Smith",
            playerSlug: "ben-smith",
            teamId: "away-team",
          },
        ],
      ),
    ).toEqual({});
  });
});
