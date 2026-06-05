import { describe, expect, it } from "vitest";

import {
  buildLeagueOnePlayerSlug,
  buildLeagueOneMatchPageLineupUrl,
  buildLeagueOnePrintUrl,
  extractLeagueOneMatchNumber,
  isLeagueOneLineupTarget,
} from "@/lib/ingestion/league-one-lineups";

describe("League One lineup ingestion helpers", () => {
  it("derives print URLs from numeric match event ids", () => {
    expect(
      extractLeagueOneMatchNumber({
        source: "league-one.jp",
        wikipedia_event_id: "match_29559",
      }),
    ).toBe(29559);
    expect(buildLeagueOnePrintUrl(29559)).toBe(
      "https://league-one.jp/match/29559/print",
    );
    expect(buildLeagueOneMatchPageLineupUrl(29559)).toBe(
      "https://league-one.jp/match/29559?t1=1",
    );
  });

  it("skips non-numeric playoff fallback event ids", () => {
    expect(
      extractLeagueOneMatchNumber({
        source: "league-one.jp",
        wikipedia_event_id: "playoff_tokyo_v_saitama",
      }),
    ).toBeNull();
  });

  it("accepts scheduled and finished League One matches only", () => {
    const baseTarget = {
      away_team_id: "away",
      external_ids: { wikipedia_event_id: "match_29559" },
      home_team_id: "home",
      id: "match",
      match_lineups: [],
    };

    expect(
      isLeagueOneLineupTarget({
        ...baseTarget,
        competition: { family: "league-one" },
        status: "scheduled",
      }),
    ).toBe(true);
    expect(
      isLeagueOneLineupTarget({
        ...baseTarget,
        competition: { family: "league-one" },
        status: "finished",
      }),
    ).toBe(true);
    expect(
      isLeagueOneLineupTarget({
        ...baseTarget,
        competition: { family: "league-one" },
        status: "postponed",
      }),
    ).toBe(false);
    expect(
      isLeagueOneLineupTarget({
        ...baseTarget,
        competition: { family: "six-nations" },
        status: "scheduled",
      }),
    ).toBe(false);
  });

  it("builds deterministic slugs for Japanese names", () => {
    const slug = buildLeagueOnePlayerSlug("team-1", "流大");

    expect(slug).toMatch(/^player-[0-9a-f]{8}$/);
    expect(buildLeagueOnePlayerSlug("team-1", "流大")).toBe(slug);
  });
});
