import { describe, expect, it } from "vitest";

import {
  extractFixtureIdentifiers,
  extractUnreliableIdentifiers,
} from "@/lib/ingestion/external-identifiers";

import type { Json } from "@/lib/db/types";

describe("extractFixtureIdentifiers", () => {
  it("returns only the five verified fixture keys with their namespace", () => {
    expect(
      extractFixtureIdentifiers({
        match_url: "https://example.org/m/1",
        league_one_match_id: 0,
        world_rugby_match_id: "123",
        top14_lnr_id: 456,
        top14_lnr_match_path: "/match/456",
        event_id: "unverified",
        fixture_url: "https://example.org/season",
      }),
    ).toEqual([
      "match_url=https://example.org/m/1",
      "league_one_match_id=0",
      "world_rugby_match_id=123",
      "top14_lnr_id=456",
      "top14_lnr_match_path=/match/456",
    ]);
  });

  it.each([
    { wikipedia_url: "https://example.org/wiki/2026_Six_Nations" },
    { wikipedia_event_id: "England_v_Scotland" },
    { top14_lnr_url: "https://example.org/round/1" },
    {
      source: "wikipedia",
      wikipedia_event_id: "mw-content-text",
      wikipedia_url: "https://example.org/wiki/x",
    },
  ])(
    "does not treat unreliable page or anchor identifiers as fixtures: %j",
    (ids) => {
      expect(extractFixtureIdentifiers(ids)).toEqual([]);
    },
  );

  it.each<Json>([null, [], [{ match_url: "nested" }], "value", 5, false])(
    "ignores non-object input without throwing: %j",
    (ids) => {
      expect(extractFixtureIdentifiers(ids)).toEqual([]);
      expect(extractUnreliableIdentifiers(ids)).toEqual([]);
    },
  );

  it("ignores empty, null, boolean, and nested values without recursing", () => {
    expect(
      extractFixtureIdentifiers({
        match_url: "",
        league_one_match_id: null,
        world_rugby_match_id: " \t",
        top14_lnr_id: false,
        top14_lnr_match_path: { match_url: "nested" },
        source: { match_url: "nested" },
      }),
    ).toEqual([]);
  });
});

describe("extractUnreliableIdentifiers", () => {
  it("returns all three unreliable keys independently from fixture identifiers", () => {
    const ids = {
      match_url: "https://example.org/m/1",
      wikipedia_event_id: "mw-content-text",
      wikipedia_url: "https://example.org/wiki/x",
      top14_lnr_url: "https://example.org/round/1",
    };
    const unreliable = extractUnreliableIdentifiers(ids);

    expect(unreliable).toEqual([
      "wikipedia_event_id=mw-content-text",
      "wikipedia_url=https://example.org/wiki/x",
      "top14_lnr_url=https://example.org/round/1",
    ]);
    expect(extractFixtureIdentifiers(ids)).toEqual([
      "match_url=https://example.org/m/1",
    ]);
    expect(
      unreliable.filter((id) => extractFixtureIdentifiers(ids).includes(id)),
    ).toEqual([]);
  });

  it("ignores empty and nested unreliable values", () => {
    expect(
      extractUnreliableIdentifiers({
        wikipedia_event_id: "",
        wikipedia_url: null,
        top14_lnr_url: { wikipedia_url: "nested" },
      }),
    ).toEqual([]);
  });
});
