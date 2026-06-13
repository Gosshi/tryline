import { describe, expect, it } from "vitest";

import {
  parseOptions,
  shouldBackfillUrcMatch,
} from "@/scripts/backfill-urc-match-events";

describe("backfill-urc-match-events", () => {
  it("parses dry-run and season options", () => {
    expect(parseOptions(["--season=2025-26", "--dry-run"])).toEqual({
      dryRun: true,
      ownerApproved: false,
      reparseExisting: false,
      season: "2025-26",
    });
  });

  it("parses owner approval confirmation", () => {
    expect(parseOptions(["--confirm-owner-approved"])).toEqual({
      dryRun: false,
      ownerApproved: true,
      reparseExisting: false,
      season: null,
    });
  });

  it("parses reparse-existing", () => {
    expect(parseOptions(["--reparse-existing"])).toEqual({
      dryRun: false,
      ownerApproved: false,
      reparseExisting: true,
      season: null,
    });
  });

  it("rejects invalid seasons", () => {
    expect(() => parseOptions(["--season=2025"])).toThrow(
      "Invalid --season value: 2025",
    );
  });

  it("keeps the default target filter to matches without events", () => {
    expect(
      shouldBackfillUrcMatch(
        {
          external_ids: {
            wikipedia_event_id: "Round_1_Bulls_v_Zebre_Parma",
            wikipedia_url:
              "https://en.wikipedia.org/wiki/2025%E2%80%9326_United_Rugby_Championship",
          },
          match_events: [],
        },
        false,
      ),
    ).toBe(true);
    expect(
      shouldBackfillUrcMatch(
        {
          external_ids: {
            wikipedia_event_id: "Round_1_Bulls_v_Zebre_Parma",
            wikipedia_url:
              "https://en.wikipedia.org/wiki/2025%E2%80%9326_United_Rugby_Championship",
          },
          match_events: [{ id: "existing-event" }],
        },
        false,
      ),
    ).toBe(false);
  });

  it("includes existing-event matches when reparse-existing is enabled", () => {
    expect(
      shouldBackfillUrcMatch(
        {
          external_ids: {
            wikipedia_event_id: "Round_1_Bulls_v_Zebre_Parma",
            wikipedia_url:
              "https://en.wikipedia.org/wiki/2025%E2%80%9326_United_Rugby_Championship",
          },
          match_events: [{ id: "existing-event" }],
        },
        true,
      ),
    ).toBe(true);
    expect(
      shouldBackfillUrcMatch(
        {
          external_ids: {
            wikipedia_url:
              "https://en.wikipedia.org/wiki/2025%E2%80%9326_United_Rugby_Championship",
          },
          match_events: [{ id: "existing-event" }],
        },
        true,
      ),
    ).toBe(false);
  });
});
