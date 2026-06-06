import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  filterAllowedSourcedFacts,
  isAllowedSourcedFactDomain,
} from "@/lib/llm/sourced-facts/allowlist";
import { fetchSourcedFactsForMatch } from "@/lib/llm/sourced-facts/fetch";

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
    then: (
      resolve: (value: { data: unknown[]; error: null }) => unknown,
    ) => Promise.resolve(resolve({ data: cachedRows, error: null })),
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

describe("sourced facts allowlist", () => {
  it("allows configured domains and subdomains only", () => {
    expect(isAllowedSourcedFactDomain("www.rugbypass.com")).toBe(true);
    expect(isAllowedSourcedFactDomain("news.world.rugby")).toBe(true);
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
});
