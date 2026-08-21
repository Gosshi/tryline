import { describe, expect, it } from "vitest";

import {
  buildAllowedPersonEntities,
  buildKnownNonPersonNames,
} from "@/lib/content/allowed-entities";

import type { AssembledContentInput } from "@/lib/llm/types";

const baseAssembled: AssembledContentInput = {
  competition_standings: [],
  derived_stats: null,
  team_stats: null,
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
    kickoff_at_jst: "2026-07-04 (土) 19:00 JST",
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

describe("buildKnownNonPersonNames", () => {
  it("collects teams, competitions, standings, recent form, h2h, and glossary names", () => {
    const result = buildKnownNonPersonNames({
      ...baseAssembled,
      competition_standings: [
        {
          bonus_points_losing: 0,
          bonus_points_try: 0,
          drawn: 0,
          lost: 0,
          played: 1,
          points_against: 12,
          points_for: 24,
          position: 1,
          team_name: "Leinster",
          total_points: 4,
          tries_for: 3,
          won: 1,
        },
      ],
      h2h_last_5: [
        {
          away_score: 17,
          away_team_name: "Canada",
          home_score: 24,
          home_team_name: "Fiji",
          kickoff_at: "2025-07-04T10:00:00.000Z",
          match_id: "h2h-1",
          status: "finished",
        },
      ],
      japanese_name_glossary: [
        {
          japanese: "ユナイテッド・ラグビー・チャンピオンシップ",
          kind: "competition",
          source: "URC",
        },
      ],
      match: {
        ...baseAssembled.match,
        away_team: {
          country: "IT",
          english_name: "Italy",
          id: "italy",
          name: "Italy",
          name_ja: "イタリア",
          short_code: "ITA",
          slug: "italy",
        },
        competition: {
          family: "nations-championship",
          id: "competition-1",
          name: "Nations Championship 2026",
          name_ja: "ネーションズチャンピオンシップ",
          season: "2026",
          slug: "nations-championship-2026",
        },
        home_team: {
          country: "JP",
          english_name: "Japan",
          id: "japan",
          name: "Japan",
          name_ja: "日本",
          short_code: "JPN",
          slug: "japan",
        },
      },
      recent_form: {
        away: [],
        home: [
          {
            away_score: 21,
            away_team_name: "France",
            home_score: 18,
            home_team_name: "Ireland",
            kickoff_at: "2025-03-01T10:00:00.000Z",
            match_id: "recent-1",
            status: "finished",
          },
        ],
      },
    });

    expect(result).toEqual([
      "Japan",
      "日本",
      "Italy",
      "イタリア",
      "Nations Championship 2026",
      "ネーションズチャンピオンシップ",
      "2026",
      "Ireland",
      "France",
      "Fiji",
      "Canada",
      "Leinster",
      "URC",
      "ユナイテッド・ラグビー・チャンピオンシップ",
    ]);
  });
});
