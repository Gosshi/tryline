import { describe, expect, it } from "vitest";

import {
  matchWikipediaEntryToMatch,
  parseOptions,
} from "@/scripts/seed-wikipedia-external-ids";

import type { Json } from "@/lib/db/types";

describe("seed-wikipedia-external-ids", () => {
  it("parses family and dry-run options", () => {
    expect(parseOptions(["--family=premiership", "--dry-run"])).toEqual({
      dryRun: true,
      family: "premiership",
    });
    expect(parseOptions(["--family=rugby-championship"])).toEqual({
      dryRun: false,
      family: "rugby-championship",
    });
    expect(() => parseOptions(["--family=top-14"])).toThrow(
      "Unsupported --family value",
    );
  });

  it("matches Wikipedia entries to DB rows and merges external ids", () => {
    const update = matchWikipediaEntryToMatch(
      {
        awayTeamName: "Sale",
        dateKey: "2025-10-04",
        dateText: "2025-10-04",
        homeTeamName: "Gloucester",
        sectionId: "Gloucester_v_Sale",
      },
      [
        {
          away_team: { name: "Sale Sharks" },
          external_ids: {
            source: "manual",
            wikipedia_event_id: "old",
          } as Json,
          home_team: { name: "Gloucester Rugby" },
          id: "match-1",
          kickoff_at: "2025-10-04T14:00:00.000Z",
        },
      ],
      "https://en.wikipedia.org/wiki/season",
    );

    expect(update).toMatchObject({
      id: "match-1",
      nextExternalIds: {
        source: "manual",
        wikipedia_event_id: "Gloucester_v_Sale",
        wikipedia_url: "https://en.wikipedia.org/wiki/season",
      },
    });
  });

  it("does not match ambiguous rows", () => {
    const source = {
      awayTeamName: "Sale",
      dateKey: null,
      dateText: null,
      homeTeamName: "Gloucester",
      sectionId: null,
    };
    const rows = [
      {
        away_team: { name: "Sale Sharks" },
        external_ids: {} as Json,
        home_team: { name: "Gloucester Rugby" },
        id: "match-1",
        kickoff_at: "2025-10-04T14:00:00.000Z",
      },
      {
        away_team: { name: "Sale Sharks" },
        external_ids: {} as Json,
        home_team: { name: "Gloucester Rugby" },
        id: "match-2",
        kickoff_at: "2025-12-20T14:00:00.000Z",
      },
    ];

    expect(matchWikipediaEntryToMatch(source, rows, "https://example.com")).toBeNull();
  });
});
