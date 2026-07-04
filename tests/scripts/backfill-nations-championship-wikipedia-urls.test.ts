import { describe, expect, it } from "vitest";

import { WIKIPEDIA_SIX_NATIONS_2027_URL } from "@/lib/ingestion/sources/wikipedia-six-nations-2027";
import {
  buildWikipediaUrlUpdates,
  getNationsChampionshipWikipediaUrl,
  mergeWikipediaUrl,
  NATIONS_CHAMPIONSHIP_NORTHERN_URL,
  NATIONS_CHAMPIONSHIP_SOUTHERN_URL,
  parseOptions,
  SIX_NATIONS_2027_SLUG,
} from "@/scripts/backfill-nations-championship-wikipedia-urls";

import type { Json } from "@/lib/db/types";

describe("backfill-nations-championship-wikipedia-urls", () => {
  it("defaults to dry-run and requires explicit owner approval to apply", () => {
    expect(parseOptions([])).toEqual({ dryRun: true });
    expect(parseOptions(["--dry-run"])).toEqual({ dryRun: true });
    expect(parseOptions(["--confirm-owner-approved"])).toEqual({
      dryRun: false,
    });
    expect(() => parseOptions(["--apply"])).toThrow(
      "backfill-nations-championship-wikipedia-urls.ts",
    );
  });

  it("maps Nations Championship rounds 1-3 to Southern and 4-6 to Northern", () => {
    expect(
      getNationsChampionshipWikipediaUrl({
        wikipedia_round: "1",
      } as Json),
    ).toBe(NATIONS_CHAMPIONSHIP_SOUTHERN_URL);
    expect(
      getNationsChampionshipWikipediaUrl({
        wikipedia_round: "3",
      } as Json),
    ).toBe(NATIONS_CHAMPIONSHIP_SOUTHERN_URL);
    expect(
      getNationsChampionshipWikipediaUrl({
        wikipedia_round: "4",
      } as Json),
    ).toBe(NATIONS_CHAMPIONSHIP_NORTHERN_URL);
    expect(
      getNationsChampionshipWikipediaUrl({
        wikipedia_round: "6",
      } as Json),
    ).toBe(NATIONS_CHAMPIONSHIP_NORTHERN_URL);
  });

  it("does not assign a URL for Finals Weekend or unknown rounds", () => {
    expect(
      getNationsChampionshipWikipediaUrl({
        wikipedia_round: "7",
      } as Json),
    ).toBeNull();
    expect(getNationsChampionshipWikipediaUrl({} as Json)).toBeNull();
  });

  it("preserves existing external_ids keys while adding wikipedia_url", () => {
    expect(
      mergeWikipediaUrl(
        {
          source: "wikipedia",
          wikipedia_event_id: "Japan_v_Italy",
          wikipedia_round: "1",
        } as Json,
        NATIONS_CHAMPIONSHIP_SOUTHERN_URL,
      ),
    ).toEqual({
      source: "wikipedia",
      wikipedia_event_id: "Japan_v_Italy",
      wikipedia_round: "1",
      wikipedia_url: NATIONS_CHAMPIONSHIP_SOUTHERN_URL,
    });
  });

  it("builds updates for NC 2026 and Six Nations 2027 and skips unsupported rounds", () => {
    const { skipped, updates } = buildWikipediaUrlUpdates([
      {
        away_team: { name: "Italy" },
        competition: { slug: "nations-championship-2026" },
        external_ids: {
          source: "wikipedia",
          wikipedia_event_id: "Japan_v_Italy",
          wikipedia_round: "1",
        } as Json,
        home_team: { name: "Japan" },
        id: "nc-round-1",
        kickoff_at: "2026-07-04T10:30:00.000Z",
      },
      {
        away_team: { name: "Ireland" },
        competition: { slug: "nations-championship-2026" },
        external_ids: {
          source: "wikipedia",
          wikipedia_event_id: "England_v_Ireland",
          wikipedia_round: "6",
        } as Json,
        home_team: { name: "England" },
        id: "nc-round-6",
        kickoff_at: "2026-11-21T15:00:00.000Z",
      },
      {
        away_team: { name: "France" },
        competition: { slug: SIX_NATIONS_2027_SLUG },
        external_ids: { source: "wikipedia" } as Json,
        home_team: { name: "Italy" },
        id: "six-nations-2027",
        kickoff_at: "2027-02-06T15:00:00.000Z",
      },
      {
        competition: { slug: "nations-championship-2026" },
        external_ids: {
          wikipedia_round: "7",
        } as Json,
        id: "finals-weekend",
        kickoff_at: "2026-11-28T15:00:00.000Z",
      },
    ]);

    expect(updates).toHaveLength(3);
    expect(updates.map((update) => [update.matchId, update.to])).toEqual([
      ["nc-round-1", NATIONS_CHAMPIONSHIP_SOUTHERN_URL],
      ["nc-round-6", NATIONS_CHAMPIONSHIP_NORTHERN_URL],
      ["six-nations-2027", WIKIPEDIA_SIX_NATIONS_2027_URL],
    ]);
    expect(skipped).toEqual([
      {
        competitionSlug: "nations-championship-2026",
        matchId: "finals-weekend",
        reason: "unsupported_round",
        round: "7",
      },
    ]);
  });
});
