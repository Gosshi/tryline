import { beforeEach, describe, expect, it, vi } from "vitest";

import { runOrchestrate } from "@/lib/cron/orchestrate";

import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type DbFixture = {
  competitionFamilies?: Record<string, string>;
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
  kickoffLte?: string;
  orderByKickoff?: "asc" | "desc";
  status?: "scheduled" | "finished";
};

type ContentQueryState = {
  contentType?: "preview" | "recap";
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
          return true;
        });
      }

      if (
        matchesBuilder.state.status === "finished" &&
        matchesBuilder.state.orderByKickoff
      ) {
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
      return Promise.resolve(
        resolve({
          data: existingIds.map((match_id) => ({ match_id })),
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
    expect(result.lineups).toEqual({ triggered: 1, no_url: 0 });
  });

  it("includes next-day early UTC kickoffs in the 12-72h preview window", async () => {
    const db = createMockDb({
      scheduledIds: ["too-soon", "srp-next-day", "too-late"],
      scheduledKickoffAt: {
        "srp-next-day": "2026-05-16T04:35:00.000Z",
        "too-late": "2026-05-18T12:01:00.000Z",
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

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(generateContent).toHaveBeenCalledWith("srp-next-day", "preview");
    expect(ingestLineups).toHaveBeenCalledWith("srp-next-day", null);
    expect(result.previews).toEqual({ triggered: 1, skipped: 0 });
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

  it("calls recap generation for finished matches without recap content", async () => {
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

    expect(generateContent).toHaveBeenCalledWith("finished-1", "recap");
    expect(result.recaps).toEqual({ triggered: 1, skipped: 0 });
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
      now,
    });

    expect(generateContent).toHaveBeenNthCalledWith(1, "new-finished", "recap");
    expect(generateContent).toHaveBeenNthCalledWith(2, "old-finished", "recap");
  });

  it("counts skipped recap generation results without triggering push notifications", async () => {
    const db = createMockDb({
      scheduledIds: [],
      finishedIds: ["finished-1"],
    });
    const generateContent = vi.fn().mockResolvedValue({ status: "skipped" });
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
