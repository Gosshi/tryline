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
      "ネーションズチャンピオンシップは12カ国が参加する大会です。参加国にはイタリアが名を連ねます。",
    source_url: "https://example.com/nations-championship",
    updated_at: "2026-09-05T00:00:00.000Z",
    verified_at: null,
  });
  const competitions = queryBuilder([
    { id: "competition-1", slug: "nations-championship-2026" },
  ]);
  const standings = queryBuilder([
    { competition_id: "competition-1", team_id: "fiji-id" },
    { competition_id: "competition-1", team_id: "georgia-id" },
  ]);
  const matches = queryBuilder([
    {
      away_team_id: "georgia-id",
      competition_id: "competition-1",
      home_team_id: "fiji-id",
    },
  ]);
  const competitionTeams = queryBuilder([
    { competition_id: "competition-1", team_id: "fiji-id" },
    { competition_id: "competition-1", team_id: "georgia-id" },
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
    {
      english_name: "Italy",
      id: "italy-id",
      name: "Italy",
      name_ja: "イタリア",
      slug: "italy",
    },
  ]);

  return {
    from: vi.fn((table: string) => {
      if (table === "competition_guides") return guide;
      if (table === "competitions") return competitions;
      if (table === "competition_standings") return standings;
      if (table === "matches") return matches;
      if (table === "competition_teams") return competitionTeams;
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

  it("reports Italy as guide-only after validating complete standings coverage", async () => {
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
        candidateName: "イタリア",
        classification: "guide_only_candidate",
        context: expect.stringContaining("イタリア"),
      }),
    ]);
    expect(report.actualDataTeams).toEqual([
      { name: "ジョージア", slug: "georgia" },
      { name: "フィジー", slug: "fiji" },
    ]);
    expect(report.dataOnlyTeams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ candidateName: "ジョージア" }),
        expect.objectContaining({ candidateName: "フィジー" }),
      ]),
    );

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

  it("keeps partial standings incomplete and includes teams seen in another competition's schedule", async () => {
    const responses = {
      competition_guides: queryBuilder({
        family: "synthetic",
        guide_ja: "参加チームはTeam AとTeam B。",
        source_url: null,
        updated_at: "2026-09-08T00:00:00.000Z",
        verified_at: null,
      }),
      competition_standings: queryBuilder([
        { competition_id: "pool-a", team_id: "a" },
      ]),
      competition_teams: queryBuilder([
        { competition_id: "pool-a", team_id: "a" },
      ]),
      competitions: queryBuilder([
        { id: "pool-a", slug: "pool-a" },
        { id: "pool-b", slug: "pool-b" },
      ]),
      matches: queryBuilder([
        {
          away_team_id: "c",
          competition_id: "pool-b",
          home_team_id: "b",
        },
      ]),
      teams: queryBuilder(
        ["a", "b", "c"].map((id) => ({
          english_name: `Team ${id.toUpperCase()}`,
          id,
          name: `Team ${id.toUpperCase()}`,
          name_ja: null,
          slug: `team-${id}`,
        })),
      ),
    };
    const db = {
      from: vi.fn((table: keyof typeof responses) => responses[table]),
    } as unknown as SupabaseClient<Database>;

    const report = await auditCompetitionGuideFacts(
      db,
      { family: "synthetic", outputDir: "unused", season: "2026" },
      "2026-09-08T00:00:00.000Z",
    );

    expect(report.coverage).toBe("incomplete");
    expect(report.actualDataTeams).toHaveLength(3);
    expect(report.guideOnlyCandidates).toEqual([]);
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
