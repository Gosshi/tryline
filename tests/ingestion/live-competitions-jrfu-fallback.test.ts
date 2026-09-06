import { beforeEach, describe, expect, it, vi } from "vitest";

const ingestionMocks = vi.hoisted(() => ({
  ingestLiveCompetition: vi.fn(),
}));
const fallbackMocks = vi.hoisted(() => ({
  applyJrfuMatchEventFallback: vi.fn(),
  applyJrfuResultFallback: vi.fn(),
  fetchJrfuScheduleResults: vi.fn(),
}));

vi.mock("@/lib/ingestion/live-ingest", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ingestion/live-ingest")>()),
  ingestLiveCompetition: ingestionMocks.ingestLiveCompetition,
}));
vi.mock("@/lib/ingestion/jrfu-result-fallback", () => fallbackMocks);
vi.mock("@/lib/ingestion/jrfu-match-event-fallback", () => fallbackMocks);
vi.mock("@/lib/scrapers/jrfu-schedule-results", () => fallbackMocks);

import { ingestAllLiveCompetitions } from "@/lib/ingestion/live-competitions";

describe("live competition ingestion JRFU result fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ingestionMocks.ingestLiveCompetition.mockResolvedValue({
      competition: "source",
      counts: {
        events_inserted: 0,
        matches_inserted: 0,
        matches_updated: 0,
        unknown_teams: 0,
      },
      unknownTeamNames: [],
    });
    fallbackMocks.applyJrfuResultFallback.mockResolvedValue({
      counts: {
        existing_results_skipped: 0,
        matches_updated: 1,
        unknown_opponents_skipped: 0,
      },
      source: "jrfu-schedule",
    });
    fallbackMocks.applyJrfuMatchEventFallback.mockResolvedValue({
      counts: {
        existing_events_skipped: 0,
        match_limit_skipped: 0,
        matches_inserted: 1,
        score_mismatches_skipped: 0,
        unresolved_player_names: 0,
        unsupported_timeline_skipped: 0,
      },
      source: "jrfu-match-events",
    });
    fallbackMocks.fetchJrfuScheduleResults.mockResolvedValue([]);
  });

  it("runs after the existing live sources and returns the fallback counts", async () => {
    const results = await ingestAllLiveCompetitions();

    expect(ingestionMocks.ingestLiveCompetition).toHaveBeenCalled();
    expect(fallbackMocks.fetchJrfuScheduleResults).toHaveBeenCalledTimes(1);
    expect(fallbackMocks.applyJrfuResultFallback).toHaveBeenCalledWith([]);
    expect(fallbackMocks.applyJrfuMatchEventFallback).toHaveBeenCalledWith([]);
    expect(results.at(-1)).toEqual({
      counts: {
        existing_events_skipped: 0,
        match_limit_skipped: 0,
        matches_inserted: 1,
        score_mismatches_skipped: 0,
        unresolved_player_names: 0,
        unsupported_timeline_skipped: 0,
      },
      source: "jrfu-match-events",
    });
  });

  it("runs the fallback when an existing source fails", async () => {
    ingestionMocks.ingestLiveCompetition.mockRejectedValueOnce(new Error("source failed"));

    await ingestAllLiveCompetitions();

    expect(fallbackMocks.applyJrfuResultFallback).toHaveBeenCalledTimes(1);
    expect(fallbackMocks.applyJrfuMatchEventFallback).toHaveBeenCalledTimes(1);
  });

  it("keeps existing source results when the fallback fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fallbackMocks.applyJrfuResultFallback.mockRejectedValue(new Error("fallback failed"));

    const results = await ingestAllLiveCompetitions();

    expect(results).toHaveLength(13);
    expect(error).toHaveBeenCalledWith(
      "Failed to apply JRFU fallback:",
      expect.any(Error),
    );
    error.mockRestore();
  });
});
