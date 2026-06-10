import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  estimateRegenerationCost,
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
    qa:
      status === "skipped"
        ? null
        : {
            issues: [],
            scores: {
              factual_grounding: 5,
              information_density: 5,
              japanese_quality: 5,
              tactical_depth: 5,
            },
            verdict: status === "published" ? "publish" : "retry",
          },
    status,
  };
}

function createMockDb(contentRows: ContentFixture[]): SupabaseClient<Database> {
  const state: { matchIds: string[] | null } = { matchIds: null };
  const contentBuilder = {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn((column: string, values: string[]) => {
      if (column === "match_id") {
        state.matchIds = values;
      }

      return contentBuilder;
    }),
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
          data: contentRows
            .filter(
              (row) =>
                state.matchIds === null || state.matchIds.includes(row.matchId),
            )
            .map((row) => ({
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
      fromVersion: null,
      matchIds: [],
      ownerApproved: false,
    });
    expect(
      parseArgs(["--content-type=preview", "--family", "six-nations"]),
    ).toEqual({
      contentType: "preview",
      dryRun: false,
      family: "six-nations",
      fromVersion: null,
      matchIds: [],
      ownerApproved: false,
    });
    expect(parseArgs(["--from-version=recap@1.8.0"])).toEqual({
      contentType: "recap",
      dryRun: false,
      family: null,
      fromVersion: "recap@1.8.0",
      matchIds: [],
      ownerApproved: false,
    });
    expect(parseArgs(["--confirm-owner-approved"])).toEqual({
      contentType: "recap",
      dryRun: false,
      family: null,
      fromVersion: null,
      matchIds: [],
      ownerApproved: true,
    });
  });

  it("parses match ids from file and comma-separated args with trimming and dedupe", () => {
    const dir = mkdtempSync(join(tmpdir(), "tryline-match-ids-"));
    const filePath = join(dir, "fabricated-ids.txt");
    writeFileSync(filePath, "\uFEFFmatch-1\n\n match-2 \nmatch-1\n", "utf8");

    expect(
      parseArgs([
        "--match-ids-file",
        filePath,
        "--match-ids=match-2, match-3,,match-3",
      ]),
    ).toMatchObject({
      matchIds: ["match-1", "match-2", "match-3"],
    });
  });

  it("estimates regeneration cost before execution", () => {
    expect(estimateRegenerationCost(255)).toEqual({
      maxUsd: 13,
      minUsd: 5.87,
      targetCount: 255,
    });
    expect(estimateRegenerationCost(890)).toEqual({
      maxUsd: 45.39,
      minUsd: 20.47,
      targetCount: 890,
    });
  });

  it("exposes current prompt versions", () => {
    expect(getCurrentPromptVersion("preview")).toBe("preview@3.4.0");
    expect(getCurrentPromptVersion("recap")).toBe("recap@4.8.0");
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
      fromVersion: null,
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
      skippedFromVersion: 0,
      skippedLeagueOne: 1,
      targets: 2,
      totalRows: 4,
    });
    expect(result.costEstimate).toEqual({
      maxUsd: 0.1,
      minUsd: 0.05,
      targetCount: 2,
    });
  });

  it("filters targets by fromVersion when provided", async () => {
    const db = createMockDb([
      {
        family: "premiership",
        matchId: "match-1",
        promptVersion: "recap@1.9.0",
      },
      {
        family: "premiership",
        matchId: "match-2",
        promptVersion: "recap@1.8.0",
      },
      {
        family: "urc",
        matchId: "match-3",
        promptVersion: "recap@1.9.0",
      },
    ]);
    const generateContent = vi.fn();

    const result = await runRegenerateOverseasContent({
      contentType: "recap",
      currentVersion: "recap@2.0.0",
      db,
      dryRun: true,
      family: "premiership",
      fromVersion: "recap@1.9.0",
      generateContent,
      logger: console,
    });

    expect(generateContent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      byFamily: {
        premiership: 1,
      },
      skippedFamily: 1,
      skippedFromVersion: 1,
      targets: 1,
      totalRows: 3,
    });
  });

  it("includes current-version rows when match ids are specified", async () => {
    const db = createMockDb([
      {
        family: "premiership",
        matchId: "match-current",
        promptVersion: "recap@4.5.0",
      },
      {
        family: "premiership",
        matchId: "match-other",
        promptVersion: "recap@1.9.0",
      },
    ]);
    const generateContent = vi.fn();

    const result = await runRegenerateOverseasContent({
      contentType: "recap",
      currentVersion: "recap@4.5.0",
      db,
      dryRun: true,
      family: null,
      fromVersion: "recap@1.9.0",
      generateContent,
      logger: console,
      matchIds: ["match-current"],
    });

    expect(generateContent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      byFamily: {
        premiership: 1,
      },
      skippedCurrentVersion: 0,
      skippedFromVersion: 0,
      targets: 1,
      totalRows: 1,
    });
  });

  it("ignores family and League One skips when match ids are specified", async () => {
    const db = createMockDb([
      {
        family: "league-one",
        matchId: "match-league-one",
        promptVersion: "recap@4.5.0",
      },
    ]);
    const generateContent = vi.fn();

    const result = await runRegenerateOverseasContent({
      contentType: "recap",
      currentVersion: "recap@4.5.0",
      db,
      dryRun: true,
      family: "six-nations",
      fromVersion: null,
      generateContent,
      logger: console,
      matchIds: ["match-league-one"],
    });

    expect(generateContent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      byFamily: {
        "league-one": 1,
      },
      skippedFamily: 0,
      skippedLeagueOne: 0,
      targets: 1,
      totalRows: 1,
    });
  });

  it("warns and skips requested match ids with no existing recap row", async () => {
    const db = createMockDb([
      {
        family: "pnc",
        matchId: "match-found",
        promptVersion: "recap@1.9.0",
      },
    ]);
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const result = await runRegenerateOverseasContent({
      contentType: "recap",
      currentVersion: "recap@4.5.0",
      db,
      dryRun: true,
      family: null,
      fromVersion: null,
      generateContent: vi.fn(),
      logger,
      matchIds: ["match-found", "match-missing"],
    });

    expect(logger.warn).toHaveBeenCalledWith(
      "[regenerate-overseas-content] no existing recap row found for match_id=match-missing; skipped.",
    );
    expect(result.targets).toBe(1);
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
      fromVersion: null,
      generateContent,
      logger,
      ownerApproved: true,
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

  it("blocks non-dry-run regeneration until Owner approval is confirmed", async () => {
    const db = createMockDb([
      {
        family: "pnc",
        matchId: "match-1",
        promptVersion: "recap@1.5.0",
      },
    ]);
    const generateContent = vi.fn();

    await expect(
      runRegenerateOverseasContent({
        contentType: "recap",
        currentVersion: "recap@1.6.0",
        db,
        dryRun: false,
        family: null,
        fromVersion: null,
        generateContent,
        logger: console,
      }),
    ).rejects.toThrow("requires Owner approval");

    expect(generateContent).not.toHaveBeenCalled();
  });
});
