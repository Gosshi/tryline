import { describe, expect, it } from "vitest";

import {
  dedupeWorldRugbyEventRows,
  dedupeWorldRugbyLineupRows,
} from "@/scripts/import-world-rugby-full";

describe("import-world-rugby-full dedupe helpers", () => {
  it("deduplicates lineup rows by match, team, and jersey number", () => {
    const rows = [
      {
        jersey_number: 10,
        match_id: "match-1",
        player_id: "player-1",
        source_url: "https://example.test/first",
        team_id: "team-1",
      },
      {
        jersey_number: 10,
        match_id: "match-1",
        player_id: "player-duplicate",
        source_url: "https://example.test/duplicate",
        team_id: "team-1",
      },
      {
        jersey_number: 10,
        match_id: "match-1",
        player_id: "player-2",
        source_url: "https://example.test/away",
        team_id: "team-2",
      },
    ];

    expect(dedupeWorldRugbyLineupRows(rows)).toEqual([
      rows[0],
      rows[2],
    ]);
  });

  it("deduplicates event rows by match, minute, type, player name, and team", () => {
    const rows = [
      {
        match_id: "match-1",
        metadata: { player_name: "Marcus Smith", source: "world-rugby" },
        minute: 12,
        player_id: "player-1",
        team_id: "team-1",
        type: "try",
      },
      {
        match_id: "match-1",
        metadata: { player_name: "Marcus Smith", source: "world-rugby" },
        minute: 12,
        player_id: "player-duplicate",
        team_id: "team-1",
        type: "try",
      },
      {
        match_id: "match-1",
        metadata: { player_name: "Marcus Smith", source: "world-rugby" },
        minute: null,
        player_id: "player-1",
        team_id: "team-1",
        type: "conversion",
      },
      {
        match_id: "match-1",
        metadata: { player_name: "Marcus Smith", source: "world-rugby" },
        minute: null,
        player_id: "player-duplicate",
        team_id: "team-1",
        type: "conversion",
      },
    ];

    expect(dedupeWorldRugbyEventRows(rows)).toEqual([
      rows[0],
      rows[2],
    ]);
  });
});
