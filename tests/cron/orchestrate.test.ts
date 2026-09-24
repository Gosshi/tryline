import { beforeEach, describe, expect, it, vi } from "vitest";

import { runOrchestrate } from "@/lib/cron/orchestrate";

import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type DbFixture = {
  competitionFamilies?: Record<string, string>;
  matchEventIds?: string[];
  onMatchEventLookup?: (matchIds: string[]) => void;
  scheduledIds: string[];
  finishedIds: string[];
  finishedKickoffAt?: Record<string, string>;
  existingPreviewIds?: string[];
  existingRecapIds?: string[];
  scheduledKickoffAt?: Record<string, string>;
  matchDetails?: Record<
    string,
    {
      away_score: number | null;
      away_team: { name: string; slug: string } | null;
      home_score: number | null;
      home_team: { name: string; slug: string } | null;
      id: string;
    }
  >;
};

type MatchQueryState = {
  id?: string;
  kickoffGte?: string;
  kickoffLt?: string;
  kickoffLte?: string;
  orderByKickoff?: "asc" | "desc";
  status?: "scheduled" | "finished";
};

type ContentQueryState = {
  contentType?: "preview" | "recap";
  matchIds?: string[];
};

type MatchEventQueryState = {
  matchIds?: string[];
};

function createMockDb(fixture: DbFixture): SupabaseClient<Database> {
  const matchesBuilder = {
    state: {} as MatchQueryState,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((column: string, value: unknown) => {
      if (
        column === "status" &&
        (value === "scheduled" || value === "finished")
      ) {
        matchesBuilder.state.status = value;
      }
      if (column === "id" && typeof value === "string") {
        matchesBuilder.state.id = value;
      }
      return matchesBuilder;
    }),
    gte: vi.fn((column: string, value: unknown) => {
      if (column === "kickoff_at" && typeof value === "string") {
        matchesBuilder.state.kickoffGte = value;
      }
      return matchesBuilder;
    }),
    lte: vi.fn((column: string, value: unknown) => {
      if (column === "kickoff_at" && typeof value === "string") {
        matchesBuilder.state.kickoffLte = value;
      }
      return matchesBuilder;
    }),
    lt: vi.fn((column: string, value: unknown) => {
      if (column === "kickoff_at" && typeof value === "string") {
        matchesBuilder.state.kickoffLt = value;
      }
      return matchesBuilder;
    }),
    order: vi.fn((column: string, options?: { ascending?: boolean }) => {
      if (column === "kickoff_at") {
        matchesBuilder.state.orderByKickoff = options?.ascending
          ? "asc"
          : "desc";
      }
      return matchesBuilder;
    }),
    single: vi.fn(() =>
      Promise.resolve({
        data: matchesBuilder.state.id
          ? (fixture.matchDetails?.[matchesBuilder.state.id] ?? null)
          : null,
        error: null,
      }),
    ),
    then: (
      resolve: (value: { data: { id: string }[]; error: null }) => unknown,
    ) => {
      let ids =
        matchesBuilder.state.status === "scheduled"
          ? fixture.scheduledIds
          : fixture.finishedIds;

      if (matchesBuilder.state.status === "scheduled") {
        ids = ids.filter((id) => {
          const kickoffAt = fixture.scheduledKickoffAt?.[id];
          if (!kickoffAt) {
            return true;
          }
          if (
            matchesBuilder.state.kickoffGte &&
            kickoffAt < matchesBuilder.state.kickoffGte
          ) {
            return false;
          }
          if (
            matchesBuilder.state.kickoffLte &&
            kickoffAt > matchesBuilder.state.kickoffLte
          ) {
            return false;
          }
          if (
            matchesBuilder.state.kickoffLt &&
            kickoffAt >= matchesBuilder.state.kickoffLt
          ) {
            return false;
          }
          return true;
        });
      }

      if (matchesBuilder.state.status === "finished") {
        ids = ids.filter((id) => {
          const kickoffAt = fixture.finishedKickoffAt?.[id];
          if (!kickoffAt) return true;
          return !(
            (matchesBuilder.state.kickoffGte &&
              kickoffAt < matchesBuilder.state.kickoffGte) ||
            (matchesBuilder.state.kickoffLte &&
              kickoffAt > matchesBuilder.state.kickoffLte)
          );
        });
      }

      if (matchesBuilder.state.orderByKickoff) {
        ids = [...ids].sort((left, right) => {
          const leftKickoff = fixture.finishedKickoffAt?.[left] ?? "";
          const rightKickoff = fixture.finishedKickoffAt?.[right] ?? "";
          return matchesBuilder.state.orderByKickoff === "asc"
            ? leftKickoff.localeCompare(rightKickoff)
            : rightKickoff.localeCompare(leftKickoff);
        });
      }

      return Promise.resolve(
        resolve({
          data: ids.map((id) => ({
            competition: fixture.competitionFamilies?.[id]
              ? { family: fixture.competitionFamilies[id] }
              : null,
            id,
          })),
          error: null,
        }),
      );
    },
  };

  const contentBuilder = {
    state: {} as ContentQueryState,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((column: string, value: unknown) => {
      if (
        column === "content_type" &&
        (value === "preview" || value === "recap")
      ) {
        contentBuilder.state.contentType = value;
      }
      return contentBuilder;
    }),
    in: vi.fn((column: string, value: unknown) => {
      if (column === "match_id" && Array.isArray(value)) {
        contentBuilder.state.matchIds = value as string[];
      }
      return contentBuilder;
    }),
    then: (
      resolve: (value: {
        data: { match_id: string }[];
        error: null;
      }) => unknown,
    ) => {
      const existingIds =
        contentBuilder.state.contentType === "preview"
          ? (fixture.existingPreviewIds ?? [])
          : (fixture.existingRecapIds ?? []);
      const matchingIds = contentBuilder.state.matchIds
        ? existingIds.filter((id) => contentBuilder.state.matchIds?.includes(id))
        : existingIds.slice(0, 1_000);
      return Promise.resolve(
        resolve({
          data: matchingIds.map((match_id) => ({ match_id })),
          error: null,
        }),
      );
    },
  };

  const matchEventsBuilder = {
    state: {} as MatchEventQueryState,
    select: vi.fn().mockReturnThis(),
    in: vi.fn((column: string, value: unknown) => {
      if (column === "match_id" && Array.isArray(value)) {
        const matchIds = value as string[];
        matchEventsBuilder.state.matchIds = matchIds;
        fixture.onMatchEventLookup?.(matchIds);
      }
      return matchEventsBuilder;
    }),
    then: (
      resolve: (value: {
        data: { match_id: string }[];
        error: null;
      }) => unknown,
    ) => {
      const matchEventIds = fixture.matchEventIds ?? fixture.finishedIds;
      const matchIds = matchEventsBuilder.state.matchIds ?? [];

      return Promise.resolve(
        resolve({
          data: matchEventIds
            .filter((matchId) => matchIds.includes(matchId))
            .map((match_id) => ({ match_id })),
          error: null,
        }),
      );
    },
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "matches") {
        return matchesBuilder;
      }

      if (table === "match_content") {
        return contentBuilder;
      }

      if (table === "match_events") {
        return matchEventsBuilder;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as SupabaseClient<Database>;
}

describe("runOrchestrate", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls preview generation and lineup ingestion for T-48h matches", async () => {
    const db = createMockDb({
      scheduledIds: ["scheduled-1"],
      finishedIds: [],
    });
    const generateContent = vi.fn().mockResolvedValue(undefined);
    const ingestLineups = vi.fn().mockResolvedValue("triggered");

    const result = await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      now,
    });

    expect(ingestLineups).toHaveBeenCalledWith("scheduled-1", null);
    expect(generateContent).toHaveBeenCalledWith("scheduled-1", "preview");
    expect(result.previews).toEqual({ triggered: 1, skipped: 0 });
    expect(result.lineups).toEqual({
      triggered: 1,
      no_url: 0,
      preview_triggered: 1,
      preview_no_url: 0,
      recap_triggered: 0,
      recap_no_url: 0,
    });
  });

  it("fetches sourced facts before preview generation when provided", async () => {
    const db = createMockDb({
      scheduledIds: ["scheduled-1"],
      finishedIds: [],
    });
    const calls: string[] = [];
    const generateContent = vi.fn().mockImplementation(async () => {
      calls.push("generate");
    });
    const fetchSourcedFacts = vi.fn().mockImplementation(async () => {
      calls.push("facts");
    });
    const ingestLineups = vi.fn().mockResolvedValue("triggered");

    await runOrchestrate({
      db,
      fetchSourcedFacts,
      generateContent,
      ingestLineups,
      now,
    });

    expect(fetchSourcedFacts).toHaveBeenCalledWith("scheduled-1", "preview");
    expect(calls).toEqual(["facts", "generate"]);
  });

  it("includes due matches without a pre-kickoff lower bound", async () => {
    const db = createMockDb({
      scheduledIds: ["too-soon", "srp-next-day", "too-late"],
      scheduledKickoffAt: {
        "srp-next-day": "2026-05-16T04:35:00.000Z",
        "too-late": "2026-05-17T12:01:00.000Z",
        "too-soon": "2026-05-15T23:59:00.000Z",
      },
      finishedIds: [],
    });
    const generateContent = vi.fn().mockResolvedValue(undefined);
    const ingestLineups = vi.fn().mockResolvedValue("triggered");

    const result = await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      now: new Date("2026-05-15T12:00:00.000Z"),
    });

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent).toHaveBeenCalledWith("srp-next-day", "preview");
    expect(generateContent).toHaveBeenCalledWith("too-soon", "preview");
    expect(ingestLineups).toHaveBeenCalledWith("srp-next-day", null);
    expect(ingestLineups).toHaveBeenCalledWith("too-soon", null);
    expect(result.previews).toEqual({ triggered: 2, skipped: 0 });
  });

  it("does not generate a next-day preview before 15:00 JST", async () => {
    const db = createMockDb({
      scheduledIds: ["next-day"],
      scheduledKickoffAt: {
        "next-day": "2026-09-11T11:00:00.000Z",
      },
      finishedIds: [],
    });
    const generateContent = vi.fn().mockResolvedValue(undefined);
    const ingestLineups = vi.fn().mockResolvedValue("triggered");

    await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      now: new Date("2026-09-10T05:00:00.000Z"),
    });

    expect(generateContent).not.toHaveBeenCalledWith("next-day", "preview");
  });

  it("does not generate a next-day preview more than 24 hours before kickoff", async () => {
    const db = createMockDb({
      scheduledIds: ["next-day"],
      scheduledKickoffAt: {
        "next-day": "2026-09-11T11:00:00.000Z",
      },
      finishedIds: [],
    });
    const generateContent = vi.fn().mockResolvedValue(undefined);
    const ingestLineups = vi.fn().mockResolvedValue("triggered");

    await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      now: new Date("2026-09-10T06:00:00.000Z"),
    });

    expect(generateContent).not.toHaveBeenCalledWith("next-day", "preview");
  });

  it("generates a preview six hours before kickoff", async () => {
    const db = createMockDb({
      scheduledIds: ["six-hours-away"],
      scheduledKickoffAt: {
        "six-hours-away": "2026-09-11T11:00:00.000Z",
      },
      finishedIds: [],
    });
    const generateContent = vi.fn().mockResolvedValue(undefined);
    const ingestLineups = vi.fn().mockResolvedValue("triggered");

    await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      now: new Date("2026-09-11T05:00:00.000Z"),
    });

    expect(generateContent).toHaveBeenCalledWith(
      "six-hours-away",
      "preview",
    );
  });

  it("includes a next-day 23:00 JST preview after it enters the 24-hour window", async () => {
    const createDeps = (now: Date) => ({
      db: createMockDb({
        scheduledIds: ["next-day-2300"],
        scheduledKickoffAt: { "next-day-2300": "2026-09-19T14:00:00.000Z" },
        finishedIds: [],
      }),
      generateContent: vi.fn().mockResolvedValue(undefined),
      ingestLineups: vi.fn().mockResolvedValue("triggered"),
      now,
    });
    const friday = createDeps(new Date("2026-09-18T06:00:00.000Z"));
    const saturday = createDeps(new Date("2026-09-18T18:00:00.000Z"));

    await runOrchestrate(friday);
    await runOrchestrate(saturday);

    expect(friday.generateContent).not.toHaveBeenCalledWith("next-day-2300", "preview");
    expect(saturday.generateContent).toHaveBeenCalledWith("next-day-2300", "preview");
  });

  it.each([
    ["2026-09-19T06:00:00.000Z", false],
    ["2026-09-19T12:00:00.000Z", true],
  ])("delays Friday-night recaps until the eligible window", async (now, eligible) => {
    const generateContent = vi.fn().mockResolvedValue(undefined);
    await runOrchestrate({
      db: createMockDb({
        finishedIds: ["friday-night"],
        finishedKickoffAt: { "friday-night": "2026-09-18T12:00:00.000Z" },
        scheduledIds: [],
      }),
      generateContent,
      ingestLineups: vi.fn().mockResolvedValue("triggered"),
      now: new Date(now),
    });
    if (eligible) {
      expect(generateContent).toHaveBeenCalledWith("friday-night", "recap");
    } else {
      expect(generateContent).not.toHaveBeenCalledWith("friday-night", "recap");
    }
  });

  it("includes only previews within the 24-hour candidate window", async () => {
    const db = createMockDb({
      scheduledIds: ["target-day-start", "target-day-last", "following-day-start"],
      scheduledKickoffAt: {
        "following-day-start": "2026-09-12T15:00:00.000Z",
        "target-day-last": "2026-09-12T14:59:59.999Z",
        "target-day-start": "2026-09-11T15:00:00.000Z",
      },
      finishedIds: [],
    });
    const generateContent = vi.fn().mockResolvedValue(undefined);
    const ingestLineups = vi.fn().mockResolvedValue("triggered");

    await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      now: new Date("2026-09-11T06:00:00.000Z"),
    });

    expect(generateContent).toHaveBeenCalledWith("target-day-start", "preview");
    expect(generateContent).not.toHaveBeenCalledWith("target-day-last", "preview");
    expect(generateContent).not.toHaveBeenCalledWith(
      "following-day-start",
      "preview",
    );
  });

  it("skips preview generation when preview content already exists", async () => {
    const db = createMockDb({
      scheduledIds: ["scheduled-1"],
      finishedIds: [],
      existingPreviewIds: ["scheduled-1"],
    });
    const generateContent = vi.fn().mockResolvedValue(undefined);
    const ingestLineups = vi.fn().mockResolvedValue("triggered");

    const result = await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      now,
    });

    expect(ingestLineups).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalledWith("scheduled-1", "preview");
    expect(result.previews).toEqual({ triggered: 0, skipped: 1 });
  });

  it("excludes existing content beyond PostgREST's unfiltered 1000-row cap", async () => {
    const ids = Array.from({ length: 1_001 }, (_, index) => `match-${index}`);
    const generateContent = vi.fn().mockResolvedValue(undefined);

    const result = await runOrchestrate({
      db: createMockDb({
        existingPreviewIds: ids,
        finishedIds: [],
        scheduledIds: ids,
      }),
      generateContent,
      getCurrentTime: () => 0,
      ingestLineups: vi.fn().mockResolvedValue("triggered"),
      now,
    });

    expect(generateContent).not.toHaveBeenCalledWith("match-1000", "preview");
    expect(result.previews).toEqual({ skipped: 1_001, triggered: 0 });
  });

  it("generates English preview after Japanese preview for League One only", async () => {
    const db = createMockDb({
      competitionFamilies: {
        "league-one-preview": "league-one",
        "six-nations-preview": "six-nations",
      },
      scheduledIds: ["league-one-preview", "six-nations-preview"],
      finishedIds: [],
    });
    const generateContent = vi.fn().mockResolvedValue(undefined);
    const ingestLineups = vi.fn().mockResolvedValue("triggered");

    await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      now,
    });

    expect(generateContent).toHaveBeenCalledWith(
      "league-one-preview",
      "preview",
    );
    expect(generateContent).toHaveBeenCalledWith(
      "league-one-preview",
      "preview",
      "en",
    );
    expect(generateContent).toHaveBeenCalledWith(
      "six-nations-preview",
      "preview",
    );
    expect(generateContent).not.toHaveBeenCalledWith(
      "six-nations-preview",
      "preview",
      "en",
    );
    expect(ingestLineups).toHaveBeenCalledWith(
      "league-one-preview",
      "league-one",
    );
    expect(ingestLineups).toHaveBeenCalledWith(
      "six-nations-preview",
      "six-nations",
    );
  });

  it("refreshes lineups before generating recaps for finished matches", async () => {
    const db = createMockDb({
      scheduledIds: [],
      finishedIds: ["finished-1"],
    });
    const generateContent = vi.fn().mockResolvedValue(undefined);
    const ingestLineups = vi.fn().mockResolvedValue("triggered");

    const result = await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      now,
    });

    expect(ingestLineups).toHaveBeenCalledWith("finished-1", null);
    expect(generateContent).toHaveBeenCalledWith("finished-1", "recap");
    expect(result.recaps).toEqual({ triggered: 1, skipped: 0 });
    expect(result.lineups).toMatchObject({
      triggered: 1,
      recap_triggered: 1,
      recap_no_url: 0,
    });
  });

  it("continues recap generation when lineup ingestion fails", async () => {
    const db = createMockDb({
      scheduledIds: [],
      finishedIds: ["finished-1"],
    });
    const generateContent = vi.fn().mockResolvedValue(undefined);
    const ingestLineups = vi.fn().mockRejectedValue(new Error("lineup fail"));
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      now,
    });

    expect(generateContent).toHaveBeenCalledWith("finished-1", "recap");
    expect(result.recaps).toEqual({ triggered: 1, skipped: 0 });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[orchestrate] lineup ingestion failed",
      expect.objectContaining({ matchId: "finished-1" }),
    );

    consoleErrorSpy.mockRestore();
  });

  it("refreshes lineups before fetching facts and generating a recap", async () => {
    const db = createMockDb({
      scheduledIds: [],
      finishedIds: ["finished-1"],
    });
    const calls: string[] = [];
    const ingestLineups = vi.fn().mockImplementation(async () => {
      calls.push("lineups");
      return "triggered";
    });
    const fetchSourcedFacts = vi.fn().mockImplementation(async () => {
      calls.push("facts");
    });
    const generateContent = vi.fn().mockImplementation(async () => {
      calls.push("generate");
    });

    await runOrchestrate({
      db,
      fetchSourcedFacts,
      generateContent,
      ingestLineups,
      now,
    });

    expect(calls).toEqual(["lineups", "facts", "generate"]);
  });

  it("generates English recap after Japanese recap for League One finished matches", async () => {
    const db = createMockDb({
      competitionFamilies: {
        "league-one-finished": "league-one",
      },
      scheduledIds: [],
      finishedIds: ["league-one-finished"],
    });
    const generateContent = vi.fn().mockResolvedValue(undefined);
    const ingestLineups = vi.fn().mockResolvedValue("triggered");

    await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      now,
    });

    expect(generateContent).toHaveBeenCalledWith(
      "league-one-finished",
      "recap",
    );
    expect(generateContent).toHaveBeenCalledWith(
      "league-one-finished",
      "recap",
      "en",
    );
  });

  it("processes missing recaps from newest finished matches first", async () => {
    const db = createMockDb({
      scheduledIds: [],
      finishedIds: ["old-finished", "new-finished"],
      finishedKickoffAt: {
        "new-finished": "2026-01-02T00:00:00.000Z",
        "old-finished": "2026-01-01T00:00:00.000Z",
      },
    });
    const generateContent = vi.fn().mockResolvedValue(undefined);
    const ingestLineups = vi.fn().mockResolvedValue("triggered");

    await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      now: new Date("2026-01-03T12:00:00.000Z"),
    });

    expect(generateContent).toHaveBeenNthCalledWith(1, "new-finished", "recap");
    expect(generateContent).toHaveBeenNthCalledWith(2, "old-finished", "recap");
  });

  const computedStartDeadlineMs = 300_000 - 220_000 - 15_000;

  it.each([
    [computedStartDeadlineMs, 4],
    [computedStartDeadlineMs + 1_000, 3],
  ])("starts queued work only through the computed deadline (%i ms)", async (resumeAt, expectedCalls) => {
    let currentTime = 0;
    const resolvers: Array<() => void> = [];
    const generateContent = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const run = runOrchestrate({
      db: createMockDb({
        scheduledIds: ["scheduled-1", "scheduled-2", "scheduled-3", "scheduled-4"],
        finishedIds: [],
      }),
      generateContent,
      getCurrentTime: () => currentTime,
      ingestLineups: vi.fn().mockResolvedValue("triggered"),
      now,
    });

    await vi.waitFor(() => expect(resolvers).toHaveLength(3));
    currentTime = resumeAt;
    resolvers.splice(0).forEach((resolve) => resolve());
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (resolvers.length > 0) {
      currentTime += 150_000;
      resolvers.splice(0).forEach((resolve) => resolve());
    }

    const result = await run;
    expect(generateContent).toHaveBeenCalledTimes(expectedCalls);
    expect(result.remaining.previews).toBe(4 - expectedCalls);
  });

  it("runs previews before recaps in a shared queue capped at three", async () => {
    let active = 0;
    let maxActive = 0;
    const generateContent = vi.fn().mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
    });

    await runOrchestrate({
      db: createMockDb({
        scheduledIds: ["preview-1", "preview-2"],
        finishedIds: ["recap-1", "recap-2", "recap-3", "recap-4", "recap-5"],
      }),
      generateContent,
      ingestLineups: vi.fn().mockResolvedValue("triggered"),
      now,
    });

    expect(generateContent.mock.calls.slice(0, 3)).toEqual([
      ["preview-1", "preview"],
      ["preview-2", "preview"],
      ["recap-1", "recap"],
    ]);
    expect(maxActive).toBe(3);
  });

  it("runs three recaps at once and reports two that missed the deadline", async () => {
    let currentTime = 0;
    let active = 0;
    let maxActive = 0;
    const resolvers: Array<() => void> = [];
    const generateContent = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          resolvers.push(() => {
            active -= 1;
            resolve();
          });
        }),
    );
    const run = runOrchestrate({
      db: createMockDb({
        scheduledIds: [],
        finishedIds: ["recap-1", "recap-2", "recap-3", "recap-4", "recap-5"],
      }),
      generateContent,
      getCurrentTime: () => currentTime,
      ingestLineups: vi.fn().mockResolvedValue("triggered"),
      now,
    });

    await vi.waitFor(() => expect(resolvers).toHaveLength(3));
    expect(maxActive).toBe(3);
    currentTime = 150_000;
    resolvers.splice(0).forEach((resolve) => resolve());

    const result = await run;
    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(result.remaining).toEqual({ previews: 0, recaps: 2 });
  });

  it("stops preview generation after the time budget", async () => {
    let currentTime = 0;
    const generateContent = vi.fn().mockImplementation(async () => {
      currentTime += 120_000;
    });
    const notifyRecapSkipped = vi.fn().mockResolvedValue(undefined);

    const result = await runOrchestrate({
      db: createMockDb({
        scheduledIds: Array.from(
          { length: 10 },
          (_, index) => `scheduled-${index + 1}`,
        ),
        finishedIds: [],
      }),
      generateContent,
      getCurrentTime: () => currentTime,
      ingestLineups: vi.fn().mockResolvedValue("triggered"),
      notifyRecapSkipped,
      now,
    });

    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(result.previews).toEqual({ triggered: 3, skipped: 0 });
    expect(notifyRecapSkipped).toHaveBeenCalledWith({
      batchSize: 10,
      excludedMatches: [],
      matches: [],
      skippedCount: 0,
      timeBudgetSkipped: { preview: 7, recap: 0 },
    });
  });

  it("limits preview generation concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const generateContent = vi.fn().mockImplementation(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
    });

    await runOrchestrate({
      db: createMockDb({
        scheduledIds: Array.from(
          { length: 10 },
          (_, index) => `scheduled-${index + 1}`,
        ),
        finishedIds: [],
      }),
      generateContent,
      ingestLineups: vi.fn().mockResolvedValue("triggered"),
      now,
    });

    expect(maxActive).toBe(3);
  });

  it("limits recap candidates to 14 days without changing preview candidates", async () => {
    const generateContent = vi.fn().mockResolvedValue(undefined);
    await runOrchestrate({
      db: createMockDb({
        scheduledIds: ["preview-current"],
        scheduledKickoffAt: { "preview-current": "2026-09-24T12:00:00.000Z" },
        finishedIds: ["recap-current", "recap-old"],
        finishedKickoffAt: {
          "recap-current": "2026-09-20T12:00:00.000Z",
          "recap-old": "2026-09-01T12:00:00.000Z",
        },
        matchEventIds: ["recap-current", "recap-old"],
      }),
      generateContent,
      ingestLineups: vi.fn().mockResolvedValue("triggered"),
      now: new Date("2026-09-24T12:00:00.000Z"),
    });

    expect(generateContent).toHaveBeenCalledWith("preview-current", "preview");
    expect(generateContent).toHaveBeenCalledWith("recap-current", "recap");
    expect(generateContent).not.toHaveBeenCalledWith("recap-old", "recap");
  });

  it("fills the recap batch with event-bearing matches and reports eventless candidates", async () => {
    const finishedIds = [
      "missing-events-1",
      "with-events-1",
      "missing-events-2",
      "with-events-2",
      "with-events-3",
    ];
    let lookedUpMatchIds: string[] | undefined;
    const db = createMockDb({
      finishedIds,
      matchEventIds: ["with-events-1", "with-events-2", "with-events-3"],
      onMatchEventLookup: (matchIds) => {
        lookedUpMatchIds = matchIds;
      },
      scheduledIds: [],
    });
    const generateContent = vi.fn().mockResolvedValue(undefined);
    const ingestLineups = vi.fn().mockResolvedValue("triggered");
    const notifyRecapSkipped = vi.fn().mockResolvedValue(undefined);

    const result = await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      notifyRecapSkipped,
      now,
    });

    expect(lookedUpMatchIds).toEqual(finishedIds);
    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(generateContent).toHaveBeenNthCalledWith(
      1,
      "with-events-1",
      "recap",
    );
    expect(generateContent).toHaveBeenNthCalledWith(
      2,
      "with-events-2",
      "recap",
    );
    expect(generateContent).toHaveBeenNthCalledWith(
      3,
      "with-events-3",
      "recap",
    );
    expect(ingestLineups).not.toHaveBeenCalledWith("missing-events-1", null);
    expect(ingestLineups).not.toHaveBeenCalledWith("missing-events-2", null);
    expect(notifyRecapSkipped).toHaveBeenCalledWith({
      batchSize: 10,
      excludedMatches: [
        { matchId: "missing-events-1" },
        { matchId: "missing-events-2" },
      ],
      matches: [],
      skippedCount: 0,
      timeBudgetSkipped: { preview: 0, recap: 0 },
    });
    expect(result.recaps).toEqual({ triggered: 3, skipped: 0 });
  });

  it("looks past an eventless recap prefix to fill the batch", async () => {
    const eventlessIds = Array.from(
      { length: 10 },
      (_, index) => `missing-events-${index + 1}`,
    );
    const eligibleIds = ["with-events-1", "with-events-2", "with-events-3"];
    const db = createMockDb({
      finishedIds: [...eventlessIds, ...eligibleIds],
      matchEventIds: eligibleIds,
      scheduledIds: [],
    });
    const generateContent = vi.fn().mockResolvedValue(undefined);

    await runOrchestrate({
      db,
      generateContent,
      ingestLineups: vi.fn().mockResolvedValue("triggered"),
      now,
    });

    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(generateContent).toHaveBeenNthCalledWith(
      1,
      "with-events-1",
      "recap",
    );
    expect(generateContent).toHaveBeenNthCalledWith(
      2,
      "with-events-2",
      "recap",
    );
    expect(generateContent).toHaveBeenNthCalledWith(
      3,
      "with-events-3",
      "recap",
    );
  });

  it("counts recap skips when the recap-skip notifier is unset", async () => {
    const db = createMockDb({
      scheduledIds: [],
      finishedIds: ["finished-1"],
    });
    const generateContent = vi.fn().mockResolvedValue({
      skipReason: "events_unavailable",
      status: "skipped",
    });
    const ingestLineups = vi.fn().mockResolvedValue("triggered");
    const sendPushNotification = vi.fn().mockResolvedValue(undefined);
    const consoleInfoSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => {});

    const result = await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      now,
      sendPushNotification,
    });

    expect(generateContent).toHaveBeenCalledWith("finished-1", "recap");
    expect(sendPushNotification).not.toHaveBeenCalled();
    expect(result.recaps).toEqual({ triggered: 0, skipped: 1 });
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "[orchestrate] recap generation skipped",
      { matchId: "finished-1" },
    );

    consoleInfoSpy.mockRestore();
  });

  it("reports all events-unavailable recap skips once per batch", async () => {
    const finishedIds = Array.from({ length: 10 }, (_, index) => `finished-${index + 1}`);
    const db = createMockDb({ scheduledIds: [], finishedIds });
    const generateContent = vi.fn().mockResolvedValue({
      skipReason: "events_unavailable",
      status: "skipped",
    });
    const ingestLineups = vi.fn().mockResolvedValue("triggered");
    const notifyRecapSkipped = vi.fn().mockResolvedValue(undefined);

    await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      notifyRecapSkipped,
      now,
    });

    expect(notifyRecapSkipped).toHaveBeenCalledTimes(1);
    expect(notifyRecapSkipped).toHaveBeenCalledWith({
      batchSize: 10,
      excludedMatches: [],
      matches: finishedIds.map((matchId) => ({
        competitionFamily: null,
        matchId,
        reason: "events_unavailable",
      })),
      skippedCount: 10,
      timeBudgetSkipped: { preview: 0, recap: 0 },
    });
  });

  it("does not report recap skips when no recap is skipped", async () => {
    const db = createMockDb({ scheduledIds: [], finishedIds: ["finished-1"] });
    const generateContent = vi.fn().mockResolvedValue(undefined);
    const ingestLineups = vi.fn().mockResolvedValue("triggered");
    const notifyRecapSkipped = vi.fn().mockResolvedValue(undefined);

    await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      notifyRecapSkipped,
      now,
    });

    expect(notifyRecapSkipped).not.toHaveBeenCalled();
  });

  it("reports only the events-unavailable recap skips in a mixed batch", async () => {
    const skippedIds = ["finished-1", "finished-2", "finished-3"];
    const finishedIds = [
      ...skippedIds,
      "finished-4",
      "finished-5",
      "finished-6",
      "finished-7",
      "finished-8",
      "finished-9",
      "finished-10",
    ];
    const db = createMockDb({
      competitionFamilies: Object.fromEntries(
        skippedIds.map((id) => [id, "top-14"]),
      ),
      scheduledIds: [],
      finishedIds,
    });
    const generateContent = vi.fn().mockImplementation((matchId: string) =>
      Promise.resolve(
        skippedIds.includes(matchId)
          ? { skipReason: "events_unavailable", status: "skipped" }
          : undefined,
      ),
    );
    const ingestLineups = vi.fn().mockResolvedValue("triggered");
    const notifyRecapSkipped = vi.fn().mockResolvedValue(undefined);

    await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      notifyRecapSkipped,
      now,
    });

    expect(notifyRecapSkipped).toHaveBeenCalledTimes(1);
    expect(notifyRecapSkipped).toHaveBeenCalledWith({
      batchSize: 10,
      excludedMatches: [],
      matches: skippedIds.map((matchId) => ({
        competitionFamily: "top-14",
        matchId,
        reason: "events_unavailable",
      })),
      skippedCount: 3,
      timeBudgetSkipped: { preview: 0, recap: 0 },
    });
  });

  it("returns the orchestration result when recap-skip notification fails", async () => {
    const db = createMockDb({ scheduledIds: [], finishedIds: ["finished-1"] });
    const generateContent = vi.fn().mockResolvedValue({
      skipReason: "events_unavailable",
      status: "skipped",
    });
    const ingestLineups = vi.fn().mockResolvedValue("triggered");
    const notifyRecapSkipped = vi.fn().mockRejectedValue(new Error("Discord down"));
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await expect(
      runOrchestrate({
        db,
        generateContent,
        ingestLineups,
        notifyRecapSkipped,
        now,
      }),
    ).resolves.toMatchObject({ recaps: { skipped: 1, triggered: 0 } });

    consoleErrorSpy.mockRestore();
  });

  it("sends a push notification after successful recap generation", async () => {
    const db = createMockDb({
      scheduledIds: [],
      finishedIds: ["finished-1"],
      matchDetails: {
        "finished-1": {
          away_score: 17,
          away_team: { name: "Ireland", slug: "ireland" },
          home_score: 24,
          home_team: { name: "England", slug: "england" },
          id: "finished-1",
        },
      },
    });
    const generateContent = vi.fn().mockResolvedValue(undefined);
    const ingestLineups = vi.fn().mockResolvedValue("triggered");
    const sendPushNotification = vi.fn().mockResolvedValue(undefined);

    await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      now,
      sendPushNotification,
    });

    expect(sendPushNotification).toHaveBeenCalledWith({
      awayScore: 17,
      awayTeamName: "Ireland",
      awayTeamSlug: "ireland",
      homeScore: 24,
      homeTeamName: "England",
      homeTeamSlug: "england",
      matchId: "finished-1",
    });
  });

  it("skips recap generation when recap content already exists", async () => {
    const db = createMockDb({
      scheduledIds: [],
      finishedIds: ["finished-1"],
      existingRecapIds: ["finished-1"],
    });
    const generateContent = vi.fn().mockResolvedValue(undefined);
    const ingestLineups = vi.fn().mockResolvedValue("triggered");

    const result = await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      now,
    });

    expect(generateContent).not.toHaveBeenCalledWith("finished-1", "recap");
    expect(result.recaps).toEqual({ triggered: 0, skipped: 1 });
  });

  it("continues processing when individual match generation fails", async () => {
    const db = createMockDb({
      scheduledIds: ["scheduled-1", "scheduled-2"],
      finishedIds: [],
    });
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(new Error("preview fail"))
      .mockResolvedValueOnce(undefined);
    const ingestLineups = vi.fn().mockResolvedValue("triggered");
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await runOrchestrate({
      db,
      generateContent,
      ingestLineups,
      now,
    });

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(result.previews).toEqual({ triggered: 1, skipped: 0 });
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
