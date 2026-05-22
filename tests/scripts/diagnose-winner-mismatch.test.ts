import { describe, expect, it, vi } from "vitest";

import {
  findWinnerMismatchSuspicion,
  parseArgs,
  runDiagnoseWinnerMismatch,
} from "@/scripts/diagnose-winner-mismatch";

import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

type ContentFixture = {
  content: string;
  matchId: string;
};

type MatchFixture = {
  awayScore: number | null;
  awayTeamName: string;
  homeScore: number | null;
  homeTeamName: string;
  id: string;
};

function createMockDb(params: {
  contents: ContentFixture[];
  matches: MatchFixture[];
}) {
  const matchesById = new Map(params.matches.map((match) => [match.id, match]));
  const deletes: string[] = [];
  const contentBuilder = {
    delete: vi.fn(() => contentBuilder),
    eq: vi.fn((column: string, value: unknown) => {
      if (column === "match_id" && typeof value === "string") {
        deletes.push(value);
      }

      return contentBuilder;
    }),
    in: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: (
      resolve: (value: {
        data?: Array<{ content_md_ja: string; match_id: string }>;
        error: null;
      }) => unknown,
    ) => {
      if (contentBuilder.delete.mock.calls.length > 0) {
        return Promise.resolve(resolve({ error: null }));
      }

      return Promise.resolve(
        resolve({
          data: params.contents.map((content) => ({
            content_md_ja: content.content,
            match_id: content.matchId,
          })),
          error: null,
        }),
      );
    },
  };
  const matchBuilder = {
    currentId: "",
    eq: vi.fn((column: string, value: unknown) => {
      if (column === "id" && typeof value === "string") {
        matchBuilder.currentId = value;
      }

      return matchBuilder;
    }),
    select: vi.fn().mockReturnThis(),
    single: vi.fn(() => {
      const match = matchesById.get(matchBuilder.currentId);

      if (!match) {
        return Promise.resolve({
          data: null,
          error: new Error(`missing ${matchBuilder.currentId}`),
        });
      }

      return Promise.resolve({
        data: {
          away_score: match.awayScore,
          away_team: { name: match.awayTeamName },
          home_score: match.homeScore,
          home_team: { name: match.homeTeamName },
          id: match.id,
        },
        error: null,
      });
    }),
  };

  const db = {
    from: vi.fn((table: string) => {
      if (table === "match_content") return contentBuilder;
      if (table === "matches") return matchBuilder;
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as SupabaseClient<Database>;

  return { contentBuilder, db, deletes };
}

describe("diagnose-winner-mismatch", () => {
  it("parses --fix as opt-in", () => {
    expect(parseArgs([])).toEqual({ fix: false });
    expect(parseArgs(["--fix"])).toEqual({ fix: true });
  });

  it("detects loser winner-language as suspicion", () => {
    expect(
      findWinnerMismatchSuspicion({
        content: "終盤にUrayasuが接戦をものにした。",
        match: {
          away_score: 31,
          away_team: { name: "Saitama" },
          home_score: 24,
          home_team: { name: "Urayasu" },
          id: "match-1",
        },
      }),
    ).toMatchObject({
      loserName: "Urayasu",
      matchId: "match-1",
      winnerName: "Saitama",
    });
  });

  it("diagnoses by default without deleting or regenerating", async () => {
    const { contentBuilder, db } = createMockDb({
      contents: [
        {
          content: "Urayasuが勝利した。",
          matchId: "match-1",
        },
      ],
      matches: [
        {
          awayScore: 31,
          awayTeamName: "Saitama",
          homeScore: 24,
          homeTeamName: "Urayasu",
          id: "match-1",
        },
      ],
    });
    const generateContent = vi.fn();
    const logger = {
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    const result = await runDiagnoseWinnerMismatch({
      db,
      fix: false,
      generateContent,
      logger,
    });

    expect(contentBuilder.delete).not.toHaveBeenCalled();
    expect(generateContent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      checked: 1,
      fixed: 0,
      suspicions: [{ matchId: "match-1" }],
    });
  });

  it("deletes and regenerates only when --fix is enabled", async () => {
    const { contentBuilder, db, deletes } = createMockDb({
      contents: [
        {
          content: "Urayasuが勝利した。",
          matchId: "match-1",
        },
      ],
      matches: [
        {
          awayScore: 31,
          awayTeamName: "Saitama",
          homeScore: 24,
          homeTeamName: "Urayasu",
          id: "match-1",
        },
      ],
    });
    const generateContent = vi.fn().mockResolvedValue({
      contentType: "recap",
      matchId: "match-1",
      qa: {
        issues: [],
        scores: {
          factual_grounding: 5,
          information_density: 5,
          japanese_quality: 5,
          tactical_depth: 5,
        },
        verdict: "publish",
      },
      status: "published",
    });

    const result = await runDiagnoseWinnerMismatch({
      db,
      fix: true,
      generateContent,
      logger: console,
    });

    expect(contentBuilder.delete).toHaveBeenCalled();
    expect(deletes).toContain("match-1");
    expect(generateContent).toHaveBeenCalledWith("match-1", "recap");
    expect(result).toMatchObject({
      fixed: 1,
      suspicions: [{ matchId: "match-1" }],
    });
  });
});
