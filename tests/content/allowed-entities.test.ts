import { describe, expect, it } from "vitest";

import { buildAllowedPersonEntities } from "@/lib/content/allowed-entities";

import type { AssembledContentInput } from "@/lib/llm/types";

const baseAssembled: AssembledContentInput = {
  competition_standings: [],
  derived_stats: null,
  h2h_last_5: [],
  injuries: { away: [], home: [] },
  japanese_name_glossary: [],
  key_stats: {
    away: {
      avg_points_against_last_5: null,
      avg_points_for_last_5: null,
      avg_score_diff_last_5: null,
      result_streak: null,
      win_rate_last_5: null,
    },
    home: {
      avg_points_against_last_5: null,
      avg_points_for_last_5: null,
      avg_score_diff_last_5: null,
      result_streak: null,
      win_rate_last_5: null,
    },
    match: {
      late_scoring: false,
      penalty_count: { away: 0, home: 0 },
      try_count: { away: 0, home: 0 },
    },
  },
  match: {
    away_score: null,
    away_team: null,
    competition: null,
    home_score: null,
    home_team: null,
    id: "match-1",
    kickoff_at: "2026-07-04T10:00:00.000Z",
    status: "scheduled",
    venue: null,
  },
  match_events: [],
  match_phase: null,
  projected_lineups: { away: [], home: [] },
  recent_form: { away: [], home: [] },
  score_timeline: null,
  sourced_facts: [],
};

describe("buildAllowedPersonEntities", () => {
  it("includes confirmed lineups and event players", () => {
    const result = buildAllowedPersonEntities({
      ...baseAssembled,
      match_events: [
        {
          minute: 12,
          player_name: "Event Scorer",
          team_name: "Home",
          type: "try",
        },
      ],
      projected_lineups: {
        away: [
          {
            is_starter: true,
            jersey_number: 9,
            name: "Away Nine",
            position: "Scrum-half",
          },
        ],
        confirmed: { away: true, home: true },
        home: [
          {
            is_starter: true,
            jersey_number: 4,
            name: "Warner Dearns",
            position: "Lock",
          },
        ],
      },
    });

    expect(result).toEqual([
      { name: "Warner Dearns", source: "lineup" },
      { name: "Away Nine", source: "lineup" },
      { name: "Event Scorer", source: "event" },
    ]);
  });

  it("excludes unconfirmed roster fallback lineups", () => {
    const result = buildAllowedPersonEntities({
      ...baseAssembled,
      projected_lineups: {
        away: [
          {
            is_starter: null,
            jersey_number: null,
            name: "Alessandro Garbisi",
            position: "Scrum-half",
          },
        ],
        confirmed: { away: false, home: false },
        home: [
          {
            is_starter: null,
            jersey_number: null,
            name: "Harumichi Tatekawa",
            position: null,
          },
        ],
      },
    });

    expect(result).toEqual([]);
  });
});
