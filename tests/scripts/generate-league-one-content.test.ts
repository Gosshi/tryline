import { describe, expect, it, vi } from "vitest";

import {
  parseArgs,
  runLeagueOneContentGeneration,
} from "@/scripts/generate-league-one-content";

import type { Database } from "@/lib/db/types";
import type { PipelineResult } from "@/lib/llm/pipeline";
import type { SupabaseClient } from "@supabase/supabase-js";

type DbFixture = {
  competitionId?: string;
  existingRecapIds?: string[];
  finishedMatchIds?: string[];
};

type ContentQueryState = {
  matchIds: string[];
};

function pipelineResult(
  matchId: string,
  status: PipelineResult["status"],
): PipelineResult {
  return {
    contentType: "recap",
    matchId,
    qa: {
      issues: [],
      scores: {
        factual_grounding: 5,
        information_density: 5,
        japanese_quality: 5,
      },
      verdict: status === "published" ? "publish" : "retry",
    },
    status,
  };
}

function createMockDb(fixture: DbFixture): SupabaseClient<Database> {
  const competitionBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(
      fixture.competitionId
        ? { data: { id: fixture.competitionId }, error: null }
        : { data: null, error: null },
    ),
  };
  const matchesBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: (
      resolve: (value: { data: Array<{ id: string }>; error: null }) => unknown,
    ) =>
      Promise.resolve(
        resolve({
          data: (fixture.finishedMatchIds ?? []).map((id) => ({ id })),
          error: null,
        }),
      ),
  };
  const contentBuilder = {
    state: { matchIds: [] } as ContentQueryState,
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn((column: string, value: unknown) => {
      if (column === "match_id" && Array.isArray(value)) {
        contentBuilder.state.matchIds = value as string[];
      }

      return contentBuilder;
    }),
    then: (
      resolve: (
        value: { data: Array<{ match_id: string }>; error: null },
      ) => unknown,
    ) => {
      const existingIds = fixture.existingRecapIds ?? [];
      const limitedIds = contentBuilder.state.matchIds.filter((matchId) =>
        existingIds.includes(matchId),
      );

      return Promise.resolve(
        resolve({
          data: limitedIds.map((match_id) => ({ match_id })),
          error: null,
        }),
      );
    },
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "competitions") return competitionBuilder;
      if (table === "matches") return matchesBuilder;
      if (table === "match_content") return contentBuilder;
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as SupabaseClient<Database>;
}

describe("generate-league-one-content", () => {
  it("parses season and dry-run arguments", () => {
    expect(parseArgs(["--season", "2024-25", "--dry-run"])).toEqual({
      dryRun: true,
      season: "2024-25",
    });
    expect(parseArgs(["--season=2025-26"])).toEqual({
      dryRun: false,
      season: "2025-26",
    });
  });

  it("reports dry-run targets without generating content", async () => {
    const db = createMockDb({
      competitionId: "competition-1",
      existingRecapIds: ["match-2"],
      finishedMatchIds: ["match-1", "match-2", "match-3"],
    });
    const generateContent = vi.fn();

    const result = await runLeagueOneContentGeneration({
      db,
      dryRun: true,
      generateContent,
      logger: console,
      season: "2024-25",
    });

    expect(generateContent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      generated: 0,
      skipped: 1,
      targets: 2,
      totalFinished: 3,
    });
  });

  it("generates recaps sequentially and continues after errors", async () => {
    const db = createMockDb({
      competitionId: "competition-1",
      existingRecapIds: ["match-2"],
      finishedMatchIds: ["match-1", "match-2", "match-3", "match-4"],
    });
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce(pipelineResult("match-1", "published"))
      .mockRejectedValueOnce(new Error("pipeline failed"))
      .mockResolvedValueOnce(pipelineResult("match-4", "draft"));
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const result = await runLeagueOneContentGeneration({
      db,
      dryRun: false,
      generateContent,
      logger,
      season: "2024-25",
    });

    expect(generateContent).toHaveBeenNthCalledWith(1, "match-1", "recap");
    expect(generateContent).toHaveBeenNthCalledWith(2, "match-3", "recap");
    expect(generateContent).toHaveBeenNthCalledWith(3, "match-4", "recap");
    expect(result).toMatchObject({
      draft: 1,
      failed: 1,
      generated: 2,
      published: 1,
      skipped: 1,
      targets: 3,
      totalFinished: 4,
    });
  });
});
