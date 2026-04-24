import { beforeEach, describe, expect, it, vi } from "vitest";

import { runOrchestrate } from "@/lib/cron/orchestrate";

import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type DbFixture = {
  scheduledIds: string[];
  finishedIds: string[];
  existingPreviewIds?: string[];
  existingRecapIds?: string[];
};

type MatchQueryState = {
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
      if (column === "status" && (value === "scheduled" || value === "finished")) {
        matchesBuilder.state.status = value;
      }
      return matchesBuilder;
    }),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    then: (resolve: (value: { data: { id: string }[]; error: null }) => unknown) => {
      const ids = matchesBuilder.state.status === "scheduled" ? fixture.scheduledIds : fixture.finishedIds;
      return Promise.resolve(resolve({ data: ids.map((id) => ({ id })), error: null }));
    },
  };

  const contentBuilder = {
    state: {} as ContentQueryState,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn((column: string, value: unknown) => {
      if (column === "content_type" && (value === "preview" || value === "recap")) {
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
    then: (resolve: (value: { data: { match_id: string }[]; error: null }) => unknown) => {
      const existingIds =
        contentBuilder.state.contentType === "preview"
          ? fixture.existingPreviewIds ?? []
          : fixture.existingRecapIds ?? [];
      const limitedToMatchIds = (contentBuilder.state.matchIds ?? []).filter((id) => existingIds.includes(id));
      return Promise.resolve(resolve({ data: limitedToMatchIds.map((match_id) => ({ match_id })), error: null }));
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

    const result = await runOrchestrate({ db, generateContent, ingestLineups, now });

    expect(ingestLineups).toHaveBeenCalledWith("scheduled-1");
    expect(generateContent).toHaveBeenCalledWith("scheduled-1", "preview");
    expect(result.previews).toEqual({ triggered: 1, skipped: 0 });
    expect(result.lineups).toEqual({ triggered: 1, no_url: 0 });
  });

  it("skips preview generation when preview content already exists", async () => {
    const db = createMockDb({
      scheduledIds: ["scheduled-1"],
      finishedIds: [],
      existingPreviewIds: ["scheduled-1"],
    });
    const generateContent = vi.fn().mockResolvedValue(undefined);
    const ingestLineups = vi.fn().mockResolvedValue("triggered");

    const result = await runOrchestrate({ db, generateContent, ingestLineups, now });

    expect(ingestLineups).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalledWith("scheduled-1", "preview");
    expect(result.previews).toEqual({ triggered: 0, skipped: 1 });
  });

  it("calls recap generation for finished matches without recap content", async () => {
    const db = createMockDb({
      scheduledIds: [],
      finishedIds: ["finished-1"],
    });
    const generateContent = vi.fn().mockResolvedValue(undefined);
    const ingestLineups = vi.fn().mockResolvedValue("triggered");

    const result = await runOrchestrate({ db, generateContent, ingestLineups, now });

    expect(generateContent).toHaveBeenCalledWith("finished-1", "recap");
    expect(result.recaps).toEqual({ triggered: 1, skipped: 0 });
  });

  it("skips recap generation when recap content already exists", async () => {
    const db = createMockDb({
      scheduledIds: [],
      finishedIds: ["finished-1"],
      existingRecapIds: ["finished-1"],
    });
    const generateContent = vi.fn().mockResolvedValue(undefined);
    const ingestLineups = vi.fn().mockResolvedValue("triggered");

    const result = await runOrchestrate({ db, generateContent, ingestLineups, now });

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
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runOrchestrate({ db, generateContent, ingestLineups, now });

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(result.previews).toEqual({ triggered: 1, skipped: 0 });
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
