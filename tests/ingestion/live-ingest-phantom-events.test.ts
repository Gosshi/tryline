import { describe, expect, it, vi } from "vitest";

import { dropReconciledPhantomEvents } from "@/lib/ingestion/live-ingest";

import type { ParsedMatchEvent } from "@/lib/scrapers/wikipedia-match-events";

describe("dropReconciledPhantomEvents", () => {
  it("drops only null-minute scoring events that exactly reconcile a team score", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const events: ParsedMatchEvent[] = [
      {
        isPenaltyTry: false,
        minute: 10,
        playerName: "Home Try",
        teamSide: "home",
        type: "try",
      },
      {
        isPenaltyTry: false,
        minute: 11,
        playerName: "Home Kicker",
        teamSide: "home",
        type: "conversion",
      },
      {
        isPenaltyTry: false,
        minute: null,
        playerName: "Home Ghost",
        teamSide: "home",
        type: "conversion",
      },
      {
        isPenaltyTry: false,
        minute: 20,
        playerName: "Away Try",
        teamSide: "away",
        type: "try",
      },
    ];

    const filtered = dropReconciledPhantomEvents({
      awayScore: 5,
      events,
      homeScore: 7,
      matchId: "match-1",
    });

    expect(
      filtered.map((event) => ("playerName" in event ? event.playerName : "")),
    ).toEqual(["Home Try", "Home Kicker", "Away Try"]);
    expect(warn).toHaveBeenCalledWith("[phantom-events] dropped", {
      count: 1,
      matchId: "match-1",
    });

    warn.mockRestore();
  });

  it("keeps ambiguous null-minute scoring events for integrity logging", () => {
    const events: ParsedMatchEvent[] = [
      {
        isPenaltyTry: false,
        minute: 10,
        playerName: "Home Try",
        teamSide: "home",
        type: "try",
      },
      {
        isPenaltyTry: false,
        minute: 11,
        playerName: "Home Kicker",
        teamSide: "home",
        type: "conversion",
      },
      {
        isPenaltyTry: false,
        minute: null,
        playerName: "Home Ghost A",
        teamSide: "home",
        type: "conversion",
      },
      {
        isPenaltyTry: false,
        minute: null,
        playerName: "Home Ghost B",
        teamSide: "home",
        type: "conversion",
      },
    ];

    const filtered = dropReconciledPhantomEvents({
      awayScore: 0,
      events,
      homeScore: 9,
      matchId: "match-2",
    });

    expect(filtered).toHaveLength(events.length);
  });
});
