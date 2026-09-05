import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  auditCompetitionGuideFacts,
  classifyGuideMention,
  parseArgs,
  reportToCsv,
  reportToJson,
} from "@/tools/audit-competition-guide-facts";

import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

function queryBuilder(data: unknown) {
  const forbiddenWrite = vi.fn(() => {
    throw new Error("audit must not write");
  });
  const builder = {
    delete: forbiddenWrite,
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    insert: forbiddenWrite,
    maybeSingle: vi.fn(async () => ({ data, error: null })),
    select: vi.fn().mockReturnThis(),
    then: (resolve: (value: { data: unknown; error: null }) => unknown) =>
      Promise.resolve(resolve({ data, error: null })),
    update: forbiddenWrite,
    upsert: forbiddenWrite,
  };

  return builder;
}

function createMockDb(): SupabaseClient<Database> {
  const guide = queryBuilder({
    family: "nations-championship",
    guide_ja:
      "ネーションズチャンピオンシップは12カ国が参加する大会です。参加国にはジョージアが名を連ねます。",
    source_url: "https://example.com/nations-championship",
    updated_at: "2026-09-05T00:00:00.000Z",
    verified_at: null,
  });
  const competitions = queryBuilder([
    { id: "competition-1", slug: "nations-championship-2026" },
  ]);
  const standings = queryBuilder([
    { competition_id: "competition-1", team_id: "fiji-id" },
  ]);
  const teams = queryBuilder([
    {
      english_name: "Fiji",
      id: "fiji-id",
      name: "Fiji",
      name_ja: "フィジー",
      slug: "fiji",
    },
    {
      english_name: "Georgia",
      id: "georgia-id",
      name: "Georgia",
      name_ja: "ジョージア",
      slug: "georgia",
    },
  ]);

  return {
    from: vi.fn((table: string) => {
      if (table === "competition_guides") return guide;
      if (table === "competitions") return competitions;
      if (table === "competition_standings") return standings;
      if (table === "teams") return teams;
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as SupabaseClient<Database>;
}

describe("audit-competition-guide-facts", () => {
  it("requires an explicit family and season", () => {
    expect(() => parseArgs([])).toThrow("--family <family> --season <season>");
    expect(
      parseArgs(["--family=nations-championship", "--season", "2026"]),
    ).toEqual({
      family: "nations-championship",
      outputDir: "tmp/competition-guide-audit",
      season: "2026",
    });
  });

  it("reports Georgia as guide-only and Fiji as actual standings data", async () => {
    const report = await auditCompetitionGuideFacts(
      createMockDb(),
      {
        family: "nations-championship",
        outputDir: "tmp/competition-guide-audit",
        season: "2026",
      },
      "2026-09-05T01:02:03.000Z",
    );

    expect(report.coverage).toBe("complete");
    expect(report.dataSource).toBe("competition_standings");
    expect(report.guideOnlyCandidates).toEqual([
      expect.objectContaining({
        candidateName: "ジョージア",
        classification: "guide_only_candidate",
        context: expect.stringContaining("ジョージア"),
      }),
    ]);
    expect(report.actualDataTeams).toEqual([
      { name: "フィジー", slug: "fiji" },
    ]);
    expect(report.dataOnlyTeams).toEqual([
      expect.objectContaining({
        candidateName: "フィジー",
        classification: "data_only",
      }),
    ]);

    const json = reportToJson(report);
    expect(json.guide_updated_at).toBe("2026-09-05T00:00:00.000Z");
    expect(json.note).toContain("誤りとは限りません");
    expect(reportToCsv(report)).toContain("guide_updated_at");
  });

  it("separates historical and opponent-style mentions from participant candidates", () => {
    expect(
      classifyGuideMention(
        "伝説の名場面では、ジョージア戦で優勝を決めました。",
      ),
    ).toBe("historical_or_opponent_mention");
  });

  it("contains no database write methods or LLM imports", () => {
    const source = readFileSync(
      path.join(process.cwd(), "tools/audit-competition-guide-facts.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(source).not.toMatch(/getOpenAIClient|MODELS/);
  });
});
