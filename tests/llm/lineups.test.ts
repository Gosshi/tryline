import { describe, expect, it } from "vitest";

import { buildUsableContentInput } from "@/lib/llm/lineups";
import { makeAssembled } from "@/tests/fixtures/content-prompt-ab";

describe("buildUsableContentInput", () => {
  it("removes unconfirmed projected players and stale standings", () => {
    const assembled = makeAssembled({
      competition_standings: [{
        bonus_points_losing: 0,
        bonus_points_try: 0,
        drawn: 0,
        lost: 0,
        played: 1,
        points_against: 14,
        points_for: 24,
        position: 1,
        team_name: "Old standing",
        total_points: 4,
        tries_for: 3,
        won: 1,
      }],
      projected_lineups: {
        away: [{ name: "Unconfirmed player", position: "10", jersey_number: 10, is_starter: true }],
        home: [{ name: "Confirmed player", position: "9", jersey_number: 9, is_starter: true }],
        confirmed: { away: false, home: true },
      },
      standings_freshness: {
        away: { expected_played: 2, played: 1 },
        home: { expected_played: 2, played: 1 },
      },
    });

    const usable = buildUsableContentInput(assembled);

    expect(usable.projected_lineups.home).toHaveLength(1);
    expect(usable.projected_lineups.away).toEqual([]);
    expect(usable.competition_standings).toEqual([]);
    expect(assembled.projected_lineups.away).toHaveLength(1);
  });

  it("preserves standings when freshness metadata is absent", () => {
    const assembled = makeAssembled({
      competition_standings: [{
        bonus_points_losing: 0,
        bonus_points_try: 0,
        drawn: 0,
        lost: 0,
        played: 1,
        points_against: 14,
        points_for: 24,
        position: 1,
        team_name: "Current standing",
        total_points: 4,
        tries_for: 3,
        won: 1,
      }],
    });

    expect(buildUsableContentInput(assembled).competition_standings).toEqual(
      assembled.competition_standings,
    );
  });
});
