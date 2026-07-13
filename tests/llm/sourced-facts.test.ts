import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  filterAllowedSourcedFacts,
  getDbAuthoritativeFactRejectionReason,
  isAllowedSourcedFactDomain,
} from "@/lib/llm/sourced-facts/allowlist";
import {
  SEARCH_PROMPT_VERSION,
  buildSearchPrompt,
  fetchSourcedFactsForMatch,
  isSourcedFactsEnabledForMatch,
  parseSourcedFactsResponse,
} from "@/lib/llm/sourced-facts/fetch";

import type { SourcedFactRejection } from "@/lib/llm/sourced-facts/types";

const dbMock = vi.hoisted(() => ({
  from: vi.fn(),
  matchSingle: vi.fn(),
  sourcedFactsThen: vi.fn(),
  upsert: vi.fn(),
}));

const openAIMock = vi.hoisted(() => ({
  createWebSearchJsonResponse: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => dbMock,
}));
vi.mock("@/lib/llm/openai", () => openAIMock);

function createMatchBuilder() {
  return {
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: dbMock.matchSingle,
  };
}

function createSourcedFactsBuilder(cachedRows: unknown[] = []) {
  return {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: cachedRows, error: null })),
    upsert: dbMock.upsert,
  };
}

const leagueOneMatch = {
  away_team: { english_name: "Kubota Spears", name: "Kubota Spears" },
  competition: {
    family: "league-one",
    name: "Japan Rugby League One",
    season: "2025-26",
  },
  external_ids: { round_name: "Final" },
  home_team: { english_name: "Kobe Steelers", name: "Kobe Steelers" },
  id: "match-1",
  kickoff_at: "2026-06-10T09:00:00.000Z",
  status: "scheduled",
};

const nationsChampionshipMatch = {
  ...leagueOneMatch,
  competition: {
    family: "nations-championship",
    name: "Nations Championship",
    season: "2026",
  },
  external_ids: { round_name: "Round 1" },
};

describe("sourced facts allowlist", () => {
  it("allows configured domains and subdomains only", () => {
    expect(isAllowedSourcedFactDomain("www.rugbypass.com")).toBe(true);
    expect(isAllowedSourcedFactDomain("news.world.rugby")).toBe(true);
    expect(isAllowedSourcedFactDomain("bbc.com")).toBe(true);
    expect(isAllowedSourcedFactDomain("www.bbc.co.uk")).toBe(true);
    expect(isAllowedSourcedFactDomain("rugby-japan.jp")).toBe(true);
    expect(isAllowedSourcedFactDomain("www.rugby.com.au")).toBe(true);
    expect(isAllowedSourcedFactDomain("news.allblacks.com")).toBe(true);
    expect(isAllowedSourcedFactDomain("www.englandrugby.com")).toBe(true);
    expect(isAllowedSourcedFactDomain("www.espn.com")).toBe(true);
    expect(isAllowedSourcedFactDomain("www.skysports.com")).toBe(true);
    expect(isAllowedSourcedFactDomain("www.rugby-rp.com")).toBe(true);
    expect(isAllowedSourcedFactDomain("sportytrader.com")).toBe(false);
  });

  it("hard-filters non-allowlisted sources after extraction", () => {
    const facts = filterAllowedSourcedFacts([
      {
        confidence: "medium",
        fact: "Malcolm Marx is expected to miss the final through injury.",
        source_url: "https://www.rugbypass.com/news/example",
      },
      {
        confidence: "high",
        fact: "A betting site predicts a high-scoring match.",
        source_url: "https://www.sportytrader.com/example",
      },
    ]);

    expect(facts).toHaveLength(1);
    expect(facts[0]?.source_domain).toBe("rugbypass.com");
    expect(facts[0]?.confidence).toBe("medium");
  });

  it("promotes official-source facts to high confidence", () => {
    const facts = filterAllowedSourcedFacts([
      {
        confidence: "medium",
        fact: "The final will be played at National Stadium.",
        source_url: "https://league-one.jp/en/news/final",
      },
    ]);

    expect(facts[0]?.confidence).toBe("high");
  });

  it("rejects DB-authoritative score facts", () => {
    const rejected: SourcedFactRejection[] = [];
    const facts = filterAllowedSourcedFacts(
      [
        {
          confidence: "high",
          fact: "Kubota Spears defeated Kobelco Kobe 33-28 in their December meeting.",
          source_url: "https://www.rugbypass.com/news/result",
        },
      ],
      { rejected },
    );

    expect(facts).toEqual([]);
    expect(rejected).toEqual([
      {
        fact: "Kubota Spears defeated Kobelco Kobe 33-28 in their December meeting.",
        reason: "db_authoritative_score",
      },
    ]);
    expect(
      getDbAuthoritativeFactRejectionReason("Kobe won 24–19 in May."),
    ).toBe("db_authoritative_score");
  });

  it("rejects score or date facts while allowing scoreless previous-meeting context", () => {
    const facts = filterAllowedSourcedFacts([
      {
        confidence: "high",
        fact: "In their most recent meeting, the Wallabies missed a match-winning penalty in the final minute.",
        source_url: "https://www.rugbypass.com/news/recent",
      },
    ]);

    expect(facts).toHaveLength(1);
    expect(facts[0]?.fact).toBe(
      "In their most recent meeting, the Wallabies missed a match-winning penalty in the final minute.",
    );
    expect(
      getDbAuthoritativeFactRejectionReason(
        "In their most recent meeting, South Africa won 45-21",
      ),
    ).toBe("db_authoritative_score");
    expect(
      getDbAuthoritativeFactRejectionReason(
        "In their most recent meeting, the Wallabies missed a match-winning penalty in the final minute",
      ),
    ).toBeNull();
    expect(
      getDbAuthoritativeFactRejectionReason(
        "The two sides last met in November 2025",
      ),
    ).toBe("db_authoritative_relative_recency");
    expect(
      getDbAuthoritativeFactRejectionReason(
        "On 4 July 2026, England's fly-half missed a match-winning penalty attempt against South Africa in the final minute",
      ),
    ).toBe("db_authoritative_relative_recency");
    expect(
      getDbAuthoritativeFactRejectionReason(
        "On 4 July 2026, South Africa and England played a Nations Championship match in Twickenham",
      ),
    ).toBe("db_authoritative_relative_recency");
  });

  it("allows off-DB injury and lineup facts", () => {
    const facts = filterAllowedSourcedFacts([
      {
        confidence: "medium",
        fact: "Player X is out with a hamstring injury.",
        source_url: "https://www.rugbypass.com/news/injury",
      },
      {
        confidence: "medium",
        fact: "Kobe lineup features Retallick, Savea.",
        source_url: "https://www.rugbypass.com/news/lineup",
      },
    ]);

    expect(facts).toHaveLength(2);
    expect(facts.map((fact) => fact.fact)).toEqual([
      "Player X is out with a hamstring injury.",
      "Kobe lineup features Retallick, Savea.",
    ]);
  });
});

describe("buildSearchPrompt", () => {
  it("uses sourced facts prompt version 1.3.0", () => {
    expect(SEARCH_PROMPT_VERSION).toBe("sourced-facts@1.3.0");
  });

  it("targets post-match statistics, incidents, and official awards for recaps", () => {
    const prompt = buildSearchPrompt(leagueOneMatch, "recap");

    expect(prompt).toContain("Search intent (post-match):");
    expect(prompt).toContain("post-match statistics");
    expect(prompt).toContain("Player of the Match");
    expect(prompt).toContain("yellow/red cards");
    expect(prompt).toContain("sin-bins");
    expect(prompt).toContain("permanent send-offs");
    expect(prompt).toContain("resulting suspensions");
    expect(prompt).toContain("both teams' values exactly as reported");
    expect(prompt).not.toContain("latest lineup changes");
    expect(prompt).not.toContain("Search intent:\n- latest team news");
  });

  it("adds scoreless previous-meeting context to the preview search intent only", () => {
    const prompt = buildSearchPrompt(leagueOneMatch, "preview");

    expect(prompt).toContain(
      [
        "Search intent:",
        "- latest team news",
        "- injuries",
        "- latest lineup changes",
        "- player news such as retirements, transfers, and availability",
        "- key players",
        "- stakes and knockout/final context",
        "- how the previous meeting between these two teams ended, focusing on narrative details a bare scoreline would not capture (e.g., a missed match-winning penalty, a last-minute momentum swing, a memorable individual play). Do NOT restate the final score or the date of that match — those are already known; only report contextual/dramatic details not captured by the score itself",
      ].join("\n"),
    );
    expect(prompt).not.toContain("Search intent (post-match):");
    expect(prompt).not.toContain("post-match statistics");
    expect(prompt).not.toContain("yellow/red cards");
    expect(prompt).not.toContain("sin-bins");
    expect(prompt).not.toContain("both teams' values exactly as reported");

    const recapPrompt = buildSearchPrompt(leagueOneMatch, "recap");
    expect(recapPrompt).not.toContain("how the previous meeting");
  });
});

describe("isSourcedFactsEnabledForMatch", () => {
  it("enables Nations Championship regular-round matches", () => {
    expect(isSourcedFactsEnabledForMatch(nationsChampionshipMatch)).toBe(true);
  });

  it("keeps League One and knockout-round behavior enabled", () => {
    expect(isSourcedFactsEnabledForMatch(leagueOneMatch)).toBe(true);
    expect(
      isSourcedFactsEnabledForMatch({
        ...leagueOneMatch,
        competition: {
          family: "premiership",
          name: "Premiership Rugby",
          season: "2025-26",
        },
        external_ids: { round_name: "Semi-finals" },
      }),
    ).toBe(true);
  });

  it("keeps non-target regular-round matches disabled", () => {
    expect(
      isSourcedFactsEnabledForMatch({
        ...leagueOneMatch,
        competition: {
          family: "premiership",
          name: "Premiership Rugby",
          season: "2025-26",
        },
        external_ids: { round_name: "Round 12" },
      }),
    ).toBe(false);
  });
});

describe("parseSourcedFactsResponse", () => {
  const allowedFact = {
    confidence: "medium",
    fact: "Malcolm Marx is expected to miss the final through injury.",
    source_url: "https://www.rugbypass.com/news/marx",
  };

  it("extracts facts from a plain JSON string", () => {
    const facts = parseSourcedFactsResponse(
      JSON.stringify({ facts: [allowedFact] }),
    );

    expect(facts).toHaveLength(1);
    expect(facts[0]?.source_domain).toBe("rugbypass.com");
  });

  it("extracts facts from a json code fence", () => {
    const facts = parseSourcedFactsResponse(
      ["```json", JSON.stringify({ facts: [allowedFact] }), "```"].join("\n"),
    );

    expect(facts).toHaveLength(1);
    expect(facts[0]?.fact).toBe(allowedFact.fact);
  });

  it("extracts facts from JSON with surrounding prose", () => {
    const facts = parseSourcedFactsResponse(
      `Here are the sourced facts:\n${JSON.stringify({
        facts: [allowedFact],
      })}\nUse them carefully.`,
    );

    expect(facts).toHaveLength(1);
    expect(facts[0]?.confidence).toBe("medium");
  });

  it("returns an empty array for invalid non-JSON text", () => {
    expect(parseSourcedFactsResponse("not json")).toEqual([]);
    expect(parseSourcedFactsResponse("")).toEqual([]);
    expect(parseSourcedFactsResponse('{"facts":')).toEqual([]);
    expect(
      parseSourcedFactsResponse('{"facts":{"fact":"not an array"}}'),
    ).toEqual([]);
  });

  it("filters out non-allowlisted domains", () => {
    const facts = parseSourcedFactsResponse(
      JSON.stringify({
        facts: [
          allowedFact,
          {
            confidence: "high",
            fact: "A betting site lists made-up team news.",
            source_url: "https://www.sportytrader.com/rugby",
          },
        ],
      }),
    );

    expect(facts).toHaveLength(1);
    expect(facts[0]?.source_domain).toBe("rugbypass.com");
  });
});

describe("fetchSourcedFactsForMatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.matchSingle.mockResolvedValue({ data: leagueOneMatch, error: null });
    dbMock.upsert.mockResolvedValue({ error: null });
  });

  it("uses cached facts without calling web search inside the freshness window", async () => {
    const cachedRows = [
      {
        confidence: "high",
        content_type: "preview",
        fact: "Malcolm Marx is unavailable for the final.",
        fetched_at: "2026-06-09T12:00:00.000Z",
        metadata: {},
        model_version: "gpt-4o",
        source_domain: "rugbypass.com",
        source_url: "https://www.rugbypass.com/news/marx",
      },
    ];
    dbMock.from.mockImplementation((table: string) => {
      if (table === "matches") return createMatchBuilder();
      if (table === "match_sourced_facts") {
        return createSourcedFactsBuilder(cachedRows);
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await fetchSourcedFactsForMatch({
      contentType: "preview",
      matchId: "match-1",
      now: new Date("2026-06-09T18:00:00.000Z"),
    });

    expect(result.cached).toBe(true);
    expect(result.facts).toHaveLength(1);
    expect(openAIMock.createWebSearchJsonResponse).not.toHaveBeenCalled();
  });

  it("stores only allowlisted web-search facts", async () => {
    dbMock.from.mockImplementation((table: string) => {
      if (table === "matches") return createMatchBuilder();
      if (table === "match_sourced_facts") {
        return createSourcedFactsBuilder([]);
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    openAIMock.createWebSearchJsonResponse.mockResolvedValue({
      model: "gpt-4o-2024-11-20",
      text: JSON.stringify({
        facts: [
          {
            confidence: "medium",
            fact: "Malcolm Marx is expected to miss the final through injury.",
            source_url: "https://www.rugbypass.com/news/marx",
          },
          {
            confidence: "high",
            fact: "A betting site lists made-up team news.",
            source_url: "https://www.sportytrader.com/rugby",
          },
        ],
      }),
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await fetchSourcedFactsForMatch({
      contentType: "preview",
      force: true,
      matchId: "match-1",
      now: new Date("2026-06-09T18:00:00.000Z"),
    });

    expect(result.fetched).toBe(true);
    expect(result.facts).toHaveLength(1);
    expect(dbMock.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          fact: "Malcolm Marx is expected to miss the final through injury.",
          source_domain: "rugbypass.com",
        }),
      ],
      { onConflict: "match_id,fact" },
    );
  });

  it("scopes web search away from DB-authoritative records and results", async () => {
    dbMock.from.mockImplementation((table: string) => {
      if (table === "matches") return createMatchBuilder();
      if (table === "match_sourced_facts") {
        return createSourcedFactsBuilder([]);
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    openAIMock.createWebSearchJsonResponse.mockResolvedValue({
      model: "gpt-4o-2024-11-20",
      text: JSON.stringify({ facts: [] }),
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    await fetchSourcedFactsForMatch({
      contentType: "preview",
      force: true,
      matchId: "match-1",
      now: new Date("2026-06-09T18:00:00.000Z"),
    });

    const input = openAIMock.createWebSearchJsonResponse.mock.calls[0]?.[0]
      ?.input as string;
    expect(input).not.toContain("head-to-head");
    expect(input).not.toContain("recent form");
    expect(input).toContain("player news such as retirements");
    expect(input).toContain(
      "Do not return past result scores, league standings, or win/loss records",
    );
    expect(input).toContain(
      "Do not return past-match dates or relative recency phrasing",
    );
  });
});
