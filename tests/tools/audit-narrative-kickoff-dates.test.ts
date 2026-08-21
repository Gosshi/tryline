import { describe, expect, it, vi } from "vitest";

import {
  findNarrativeKickoffDateMentions,
  runNarrativeKickoffDateAudit,
} from "@/tools/audit-narrative-kickoff-dates";

const targetMatchId = "d6d5b1ab-58ec-44c8-a31d-54fadc0a662e";

const targetRow = {
  content_md: "エリス・パークで行われる8月22日の初戦。8月23日に改める必要がある。",
  content_type: "preview" as const,
  id: "target-preview",
  match: {
    id: targetMatchId,
    kickoff_at: "2026-08-22T15:10:00+00:00",
  },
  match_id: targetMatchId,
  status: "draft",
};

describe("audit-narrative-kickoff-dates", () => {
  it("classifies early-JST narrative dates against JST and UTC dates", () => {
    expect(findNarrativeKickoffDateMentions(targetRow)).toMatchObject([
      {
        dateLabel: "8月22日",
        dateMatch: "utc",
        kickoffAtJst: "2026-08-23 (日) 00:10 JST",
        matchId: targetMatchId,
        status: "draft",
      },
      {
        dateLabel: "8月23日",
        dateMatch: "jst",
      },
    ]);
  });

  it("includes draft content and reports the required match", async () => {
    const referenceQuery = {
      in: vi.fn(),
      range: vi.fn().mockResolvedValue({
        count: 1,
        data: [
          {
            ...targetRow,
            content_md: undefined,
          },
        ],
        error: null,
      }),
      select: vi.fn(),
    };
    referenceQuery.select.mockReturnValue(referenceQuery);
    referenceQuery.in.mockReturnValue(referenceQuery);
    const contentQuery = {
      in: vi.fn().mockResolvedValue({
        data: [{ content_md: targetRow.content_md, id: targetRow.id }],
        error: null,
      }),
      select: vi.fn(),
    };
    contentQuery.select.mockReturnValue(contentQuery);
    const db = {
      from: vi.fn().mockReturnValueOnce(referenceQuery).mockReturnValueOnce(contentQuery),
    };
    const logger = { log: vi.fn() };

    const result = await runNarrativeKickoffDateAudit(db as never, logger);

    expect(db.from).toHaveBeenCalledWith("match_content");
    expect(referenceQuery.select).toHaveBeenCalledWith(
      expect.stringContaining("match:matches!match_content_match_id_fkey"),
      { count: "exact" },
    );
    expect(referenceQuery.in).toHaveBeenCalledWith("content_type", ["preview", "recap"]);
    expect(referenceQuery.range).toHaveBeenCalledWith(0, 499);
    expect(contentQuery.in).toHaveBeenCalledWith("id", [targetRow.id]);
    expect(result.earlyJstContentCount).toBe(1);
    expect(result.utcDateMatches).toBe(1);
    expect(result.jstDateMatches).toBe(1);
    expect(result.findings).toContainEqual(
      expect.objectContaining({ matchId: targetMatchId, status: "draft" }),
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining("earlyJstContent=1"),
    );
  });

  it("fails instead of silently accepting a truncated first page", async () => {
    const referenceQuery = {
      in: vi.fn(),
      range: vi.fn().mockResolvedValue({ count: 2, data: [targetRow], error: null }),
      select: vi.fn(),
    };
    referenceQuery.select.mockReturnValue(referenceQuery);
    referenceQuery.in.mockReturnValue(referenceQuery);
    const db = { from: vi.fn().mockReturnValue(referenceQuery) };

    await expect(runNarrativeKickoffDateAudit(db as never)).rejects.toThrow(
      "loaded 1 of 2 content rows",
    );
  });
});
