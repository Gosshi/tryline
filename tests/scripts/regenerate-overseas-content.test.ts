import { describe, expect, it, vi } from "vitest";

import {
  getCurrentPromptVersion,
  parseArgs,
  runRegenerateOverseasContent,
} from "@/scripts/regenerate-overseas-content";

import type { Database } from "@/lib/db/types";
import type { PipelineResult } from "@/lib/llm/pipeline";
import type { SupabaseClient } from "@supabase/supabase-js";

type ContentFixture = {
  family: string | null;
  matchId: string;
  promptVersion: string;
};

function pipelineResult(
  matchId: string,
  status: PipelineResult["status"],
  contentType: PipelineResult["contentType"] = "recap",
): PipelineResult {
  return {
    contentType,
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

function createMockDb(contentRows: ContentFixture[]): SupabaseClient<Database> {
  const contentBuilder = {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: (
      resolve: (value: {
        data: Array<{
          match_id: string;
          prompt_version: string;
          match: { competition: { family: string | null } | null };
        }>;
        error: null;
      }) => unknown,
    ) =>
      Promise.resolve(
        resolve({
          data: contentRows.map((row) => ({
            match: {
              competition: row.family ? { family: row.family } : null,
            },
            match_id: row.matchId,
            prompt_version: row.promptVersion,
          })),
          error: null,
        }),
      ),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "match_content") return contentBuilder;
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as SupabaseClient<Database>;
}

describe("regenerate-overseas-content", () => {
  it("parses CLI arguments with recap defaults", () => {
    expect(parseArgs(["--dry-run"])).toEqual({
      contentType: "recap",
      dryRun: true,
      family: null,
    });
    expect(
      parseArgs(["--content-type=preview", "--family", "six-nations"]),
    ).toEqual({
      contentType: "preview",
      dryRun: false,
      family: "six-nations",
    });
  });

  it("exposes current prompt versions", () => {
    expect(getCurrentPromptVersion("preview")).toBe("preview@1.6.0");
    expect(getCurrentPromptVersion("recap")).toBe("recap@1.7.0");
  });

  it("reports dry-run targets by family and excludes League One", async () => {
    const db = createMockDb([
      {
        family: "six-nations",
        matchId: "match-1",
        promptVersion: "recap@1.5.0",
      },
      {
        family: "league-one",
        matchId: "match-2",
        promptVersion: "recap@1.5.0",
      },
      {
        family: "pnc",
        matchId: "match-3",
        promptVersion: "recap@1.6.0",
      },
      {
        family: "pnc",
        matchId: "match-4",
        promptVersion: "recap@1.4.0",
      },
    ]);
    const generateContent = vi.fn();

    const result = await runRegenerateOverseasContent({
      contentType: "recap",
      currentVersion: "recap@1.6.0",
      db,
      dryRun: true,
      family: null,
      generateContent,
      logger: console,
    });

    expect(generateContent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      byFamily: {
        pnc: 1,
        "six-nations": 1,
      },
      skippedCurrentVersion: 1,
      skippedLeagueOne: 1,
      targets: 2,
      totalRows: 4,
    });
  });

  it("regenerates sequentially and continues after errors", async () => {
    const db = createMockDb([
      {
        family: "six-nations",
        matchId: "match-1",
        promptVersion: "recap@1.5.0",
      },
      {
        family: "pnc",
        matchId: "match-2",
        promptVersion: "recap@1.5.0",
      },
      {
        family: "pnc",
        matchId: "match-3",
        promptVersion: "recap@1.5.0",
      },
    ]);
    const generateContent = vi
      .fn()
      .mockResolvedValueOnce(pipelineResult("match-2", "published"))
      .mockRejectedValueOnce(new Error("pipeline failed"));
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const result = await runRegenerateOverseasContent({
      contentType: "recap",
      currentVersion: "recap@1.6.0",
      db,
      dryRun: false,
      family: "pnc",
      generateContent,
      logger,
    });

    expect(generateContent).toHaveBeenNthCalledWith(1, "match-2", "recap");
    expect(generateContent).toHaveBeenNthCalledWith(2, "match-3", "recap");
    expect(result).toMatchObject({
      failed: 1,
      published: 1,
      regenerated: 1,
      skippedFamily: 1,
      targets: 2,
    });
  });
});
