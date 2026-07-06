import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  estimateEntityAuditCost,
  parseArgs,
  runEntityGroundingAudit,
  runWithConcurrency,
} from "@/tools/audit-entity-grounding";

import type { Database } from "@/lib/db/types";
import type { AssembledContentInput } from "@/lib/llm/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type ContentFixture = {
  contentId: string;
  contentMd: string;
  contentType: "preview" | "recap";
  generatedAt?: string | null;
  language?: "ja" | "en" | null;
  matchId: string;
  status?: string;
};

function createAssembled(): AssembledContentInput {
  return {
    competition_standings: [],
    derived_stats: null,
    team_stats: null,
    h2h_last_5: [],
    injuries: { away: [], home: [] },
    key_stats: {
      away: {
        avg_points_against_last_5: null,
        avg_points_for_last_5: null,
        avg_score_diff_last_5: null,
        result_streak: null,
        win_rate_last_5: null,
      },
      home: {
        avg_points_against_last_5: null,
        avg_points_for_last_5: null,
        avg_score_diff_last_5: null,
        result_streak: null,
        win_rate_last_5: null,
      },
      match: {
        late_scoring: false,
        penalty_count: { away: 0, home: 0 },
        try_count: { away: 0, home: 0 },
      },
    },
    match: {
      away_score: null,
      away_team: null,
      competition: null,
      home_score: null,
      home_team: null,
      id: "match-1",
      kickoff_at: "2026-07-04T10:00:00.000Z",
      status: "scheduled",
      venue: null,
    },
    match_events: [],
    match_phase: null,
    projected_lineups: { away: [], home: [] },
    recent_form: { away: [], home: [] },
    score_timeline: null,
    sourced_facts: [],
  };
}

function createMockDb(contentRows: ContentFixture[]): SupabaseClient<Database> {
  const state: {
    contentType: string[] | null;
    limit: number | null;
    status: string | null;
  } = {
    contentType: null,
    limit: null,
    status: null,
  };
  const forbiddenWrite = vi.fn(() => {
    throw new Error("write method should not be called");
  });
  const contentBuilder = {
    delete: forbiddenWrite,
    eq: vi.fn((column: string, value: string) => {
      if (column === "status") {
        state.status = value;
      }
      if (column === "content_type") {
        state.contentType = [value];
      }

      return contentBuilder;
    }),
    in: vi.fn((column: string, values: string[]) => {
      if (column === "content_type") {
        state.contentType = values;
      }

      return contentBuilder;
    }),
    insert: forbiddenWrite,
    limit: vi.fn((value: number) => {
      state.limit = value;

      return contentBuilder;
    }),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: (
      resolve: (value: {
        data: Array<{
          content_md: string;
          content_type: "preview" | "recap";
          generated_at: string | null;
          id: string;
          language: "ja" | "en" | null;
          match_id: string;
        }>;
        error: null;
      }) => unknown,
    ) => {
      const rows = contentRows
        .filter((row) => (row.status ?? "published") === state.status)
        .filter(
          (row) =>
            state.contentType === null ||
            state.contentType.includes(row.contentType),
        )
        .slice(0, state.limit ?? undefined)
        .map((row) => ({
          content_md: row.contentMd,
          content_type: row.contentType,
          generated_at: row.generatedAt ?? null,
          id: row.contentId,
          language: row.language ?? "ja",
          match_id: row.matchId,
        }));

      return Promise.resolve(resolve({ data: rows, error: null }));
    },
    update: forbiddenWrite,
    upsert: forbiddenWrite,
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "match_content") return contentBuilder;
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as SupabaseClient<Database>;
}

describe("audit-entity-grounding", () => {
  it("parses dry-run defaults and filters", () => {
    expect(parseArgs([])).toEqual({
      concurrency: 5,
      contentType: null,
      dryRun: true,
      limit: null,
      outputDir: "tmp/entity-audit",
      ownerApproved: false,
    });
    expect(
      parseArgs([
        "--content-type=preview",
        "--limit",
        "10",
        "--concurrency=2",
        "--output-dir",
        "tmp/custom-audit",
        "--confirm-owner-approved",
      ]),
    ).toEqual({
      concurrency: 2,
      contentType: "preview",
      dryRun: false,
      limit: 10,
      outputDir: "tmp/custom-audit",
      ownerApproved: true,
    });
  });

  it("estimates audit cost below one dollar for the published corpus size", () => {
    expect(estimateEntityAuditCost(899)).toEqual({
      maxUsd: 0.9,
      minUsd: 0.45,
      targetCount: 899,
    });
  });

  it("dry-runs without assembling or calling the verifier", async () => {
    const db = createMockDb([
      {
        contentId: "content-1",
        contentMd: "# preview",
        contentType: "preview",
        matchId: "match-1",
      },
      {
        contentId: "content-2",
        contentMd: "# recap",
        contentType: "recap",
        matchId: "match-2",
      },
    ]);
    const assemble = vi.fn();
    const verify = vi.fn();

    const result = await runEntityGroundingAudit({
      assemble,
      db,
      logger: console,
      options: parseArgs([]),
      verify,
    });

    expect(result).toMatchObject({
      audited: 0,
      dryRun: true,
      reportPath: null,
      targetRows: 2,
    });
    expect(assemble).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
  });

  it("filters by content type and limit, then writes JSON report", async () => {
    const outputDir = mkdtempSync(join(tmpdir(), "tryline-entity-audit-"));
    const db = createMockDb([
      {
        contentId: "content-1",
        contentMd: "# preview with player",
        contentType: "preview",
        generatedAt: "2026-07-04T00:00:00.000Z",
        matchId: "match-1",
      },
      {
        contentId: "content-2",
        contentMd: "# recap",
        contentType: "recap",
        matchId: "match-2",
      },
    ]);
    const assemble = vi.fn().mockResolvedValue(createAssembled());
    const verify = vi.fn().mockResolvedValue({
      attempts: 1,
      modelVersion: "gpt-4o-mini",
      promptVersion: "entity-verification@1.0.0",
      result: {
        mentions: [
          { matched_entity: null, surface: "アレッサンドロ・ガルビジ" },
        ],
        ungroundedSurfaces: ["アレッサンドロ・ガルビジ"],
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const result = await runEntityGroundingAudit({
      assemble,
      db,
      logger: console,
      options: parseArgs([
        "--content-type=preview",
        "--limit=1",
        "--output-dir",
        outputDir,
        "--confirm-owner-approved",
      ]),
      verify,
    });

    expect(result).toMatchObject({
      audited: 1,
      dryRun: false,
      failures: [],
      targetRows: 1,
      violations: [
        expect.objectContaining({
          contentId: "content-1",
          contentType: "preview",
          matchId: "match-1",
          ungroundedSurfaces: ["アレッサンドロ・ガルビジ"],
          url: "https://www.trylinerugby.com/matches/match-1",
        }),
      ],
    });
    expect(result.reportPath).toEqual(expect.stringContaining(outputDir));
    const report = JSON.parse(
      readFileSync(result.reportPath ?? "", "utf8"),
    ) as {
      summary: { audited: number; failures: number; violations: number };
      violations: Array<{ matchId: string }>;
    };
    expect(report.summary).toEqual({
      audited: 1,
      failures: 0,
      targetRows: 1,
      violations: 1,
    });
    expect(report.violations[0]?.matchId).toBe("match-1");
  });

  it("records verifier failures and continues the audit", async () => {
    const db = createMockDb([
      {
        contentId: "content-1",
        contentMd: "# preview",
        contentType: "preview",
        matchId: "match-1",
      },
      {
        contentId: "content-2",
        contentMd: "# recap",
        contentType: "recap",
        matchId: "match-2",
      },
    ]);
    const assemble = vi.fn().mockResolvedValue(createAssembled());
    const verify = vi
      .fn()
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce({
        attempts: 1,
        modelVersion: "gpt-4o-mini",
        promptVersion: "entity-verification@1.0.0",
        result: { mentions: [], ungroundedSurfaces: [] },
        usage: { inputTokens: 1, outputTokens: 1 },
      });
    const writeReport = vi.fn().mockResolvedValue("tmp/report.json");

    const result = await runEntityGroundingAudit({
      assemble,
      db,
      logger: console,
      options: parseArgs(["--confirm-owner-approved"]),
      verify,
      writeReport,
    });

    expect(result).toMatchObject({
      audited: 2,
      failures: [
        expect.objectContaining({
          error: "rate limited",
          matchId: "match-1",
        }),
      ],
      violations: [],
    });
    expect(verify).toHaveBeenCalledTimes(2);
  });

  it("passes known non-person names to the verifier for audit consistency", async () => {
    const assembled = createAssembled();
    assembled.match.home_team = {
      country: "IE",
      english_name: "Ireland",
      id: "team-1",
      name: "Ireland",
      name_ja: "アイルランド",
      short_code: "IRE",
      slug: "ireland",
    };
    assembled.match.away_team = {
      country: "FR",
      english_name: "France",
      id: "team-2",
      name: "France",
      name_ja: "フランス",
      short_code: "FRA",
      slug: "france",
    };
    assembled.match.competition = {
      family: "urc",
      id: "competition-1",
      name: "URC",
      name_ja: null,
      season: "2026",
      slug: "urc-2026",
    };
    const db = createMockDb([
      {
        contentId: "content-1",
        contentMd: "Ireland and URC are mentioned.",
        contentType: "preview",
        matchId: "match-1",
      },
    ]);
    const verify = vi.fn().mockResolvedValue({
      attempts: 1,
      modelVersion: "gpt-4o-mini",
      promptVersion: "entity-verification@1.0.1",
      result: {
        mentions: [
          { matched_entity: null, surface: "Ireland" },
          { matched_entity: "URC", surface: "URC" },
        ],
        ungroundedSurfaces: [],
      },
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const result = await runEntityGroundingAudit({
      assemble: vi.fn().mockResolvedValue(assembled),
      db,
      logger: console,
      options: parseArgs(["--confirm-owner-approved"]),
      verify,
      writeReport: vi.fn().mockResolvedValue("tmp/report.json"),
    });

    expect(result.violations).toEqual([]);
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({
        knownNonPersonNames: expect.arrayContaining([
          "Ireland",
          "アイルランド",
          "France",
          "フランス",
          "URC",
          "2026",
        ]),
      }),
    );
  });

  it("requires Owner approval for non-dry-run execution", async () => {
    await expect(
      runEntityGroundingAudit({
        assemble: vi.fn(),
        db: createMockDb([]),
        options: {
          ...parseArgs([]),
          dryRun: false,
          ownerApproved: false,
        },
        verify: vi.fn(),
      }),
    ).rejects.toThrow("requires Owner approval");
  });

  it("limits worker concurrency", async () => {
    let active = 0;
    let maxActive = 0;

    await runWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return value;
    });

    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
