import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  extractSourcedFactDates,
  filterAllowedSourcedFacts,
  getDbAuthoritativeFactRejectionReason,
  isAllowedSourcedFactDomain,
  SOURCED_FACT_ALLOWED_DOMAINS,
} from "@/lib/llm/sourced-facts/allowlist";
import {
  SEARCH_PROMPT_VERSION,
  buildSearchPrompt,
  fetchSourcedFactsForMatch,
  isSourcedFactsEnabledForMatch,
  loadSourcedFactsForMatch,
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
  away_team: {
    english_name: "Kubota Spears",
    name: "Kubota Spears",
    name_ja: "クボタスピアーズ",
  },
  competition: {
    family: "league-one",
    name: "Japan Rugby League One",
    season: "2025-26",
  },
  external_ids: { round_name: "Final" },
  home_team: {
    english_name: "Kobe Steelers",
    name: "Kobe Steelers",
    name_ja: "コベルコ神戸スティーラーズ",
  },
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

function cachedFact(overrides: Record<string, unknown> = {}) {
  return {
    confidence: "high",
    content_type: "preview",
    fact: "Malcolm Marx is unavailable for the final.",
    fetched_at: "2026-06-09T12:00:00.000Z",
    metadata: { prompt_version: SEARCH_PROMPT_VERSION },
    model_version: "gpt-4o",
    source_domain: "therugbypaper.co.uk",
    source_url: "https://www.therugbypaper.co.uk/news/marx",
    ...overrides,
  };
}

describe("sourced facts allowlist", () => {
  it("allows configured domains and subdomains only", () => {
    expect(isAllowedSourcedFactDomain("www.therugbypaper.co.uk")).toBe(true);
    expect(isAllowedSourcedFactDomain("rugby-japan.jp")).toBe(true);
    expect(isAllowedSourcedFactDomain("www.rugby.com.au")).toBe(true);
    expect(isAllowedSourcedFactDomain("stats.unitedrugby.com")).toBe(true);
    expect(isAllowedSourcedFactDomain("en.wikipedia.org")).toBe(true);
    expect(isAllowedSourcedFactDomain("ja.wikipedia.org")).toBe(true);
    expect(isAllowedSourcedFactDomain("www.rugby-rp.com")).toBe(true);
    expect(isAllowedSourcedFactDomain("www.onrugby.it")).toBe(true);
    expect(isAllowedSourcedFactDomain("sportytrader.com")).toBe(false);
    expect(isAllowedSourcedFactDomain(null)).toBe(false);
  });

  it("rejects every removed domain", () => {
    const removedDomains = [
      "world.rugby",
      "rugbyworldcup.com",
      "sixnationsrugby.com",
      "rugbychampionship.com",
      "rugbypass.com",
      "planetrugby.com",
      "bbc.com",
      "bbc.co.uk",
      "espn.com",
      "nbcsports.com",
      "sports.yahoo.com",
      "skysports.com",
      "news.yahoo.co.jp",
      "allblacks.com",
      "englandrugby.com",
      "lnr.fr",
    ];

    for (const domain of removedDomains) {
      expect(SOURCED_FACT_ALLOWED_DOMAINS).not.toContain(domain);
      expect(isAllowedSourcedFactDomain(`www.${domain}`)).toBe(false);
    }
  });

  it("hard-filters non-allowlisted sources after extraction", () => {
    const facts = filterAllowedSourcedFacts([
      {
        confidence: "medium",
        fact: "Malcolm Marx is expected to miss the final through injury.",
        source_url: "https://www.therugbypaper.co.uk/news/example",
      },
      {
        confidence: "high",
        fact: "A betting site predicts a high-scoring match.",
        source_url: "https://www.sportytrader.com/example",
      },
    ]);

    expect(facts).toHaveLength(1);
    expect(facts[0]?.source_domain).toBe("therugbypaper.co.uk");
    expect(facts[0]?.confidence).toBe("medium");
  });

  it("records rejected non-allowlisted sources by domain", () => {
    const rejected: SourcedFactRejection[] = [];

    const facts = filterAllowedSourcedFacts(
      [
        {
          confidence: "high",
          fact: "A betting site has published unrelated squad rumours.",
          source_url: "https://www.rugbypass.com/news/japan-squad",
        },
      ],
      {
        rejected,
        relevance: {
          kickoffAt: "2026-08-08T10:05:00.000Z",
          teamNames: [
            "Japan",
            "日本",
            "日本代表",
            "Australia",
            "オーストラリア",
          ],
        },
      },
    );

    expect(facts).toEqual([]);
    expect(rejected).toEqual([
      {
        fact: "A betting site has published unrelated squad rumours.",
        reason: "domain_not_allowed",
        source_domain: "rugbypass.com",
      },
    ]);
  });

  it("uses the supplied allowlist when evaluating a domain", () => {
    expect(isAllowedSourcedFactDomain("rugbypass.com")).toBe(false);
    expect(
      isAllowedSourcedFactDomain("rugbypass.com", [
        ...SOURCED_FACT_ALLOWED_DOMAINS,
        "rugbypass.com",
      ]),
    ).toBe(true);
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

  it("keeps single-source Wikipedia facts at medium confidence", () => {
    const facts = filterAllowedSourcedFacts([
      {
        confidence: "medium",
        fact: "Wikipedia lists the competition's inaugural season.",
        source_url: "https://en.wikipedia.org/wiki/Rugby_union",
      },
    ]);

    expect(facts[0]).toMatchObject({
      confidence: "medium",
      source_domain: "en.wikipedia.org",
    });
  });

  it("rejects DB-authoritative score facts", () => {
    const rejected: SourcedFactRejection[] = [];
    const facts = filterAllowedSourcedFacts(
      [
        {
          confidence: "high",
          fact: "Kubota Spears defeated Kobelco Kobe 33-28 in their December meeting.",
          source_url: "https://www.therugbypaper.co.uk/news/result",
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
        source_url: "https://www.therugbypaper.co.uk/news/recent",
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
        source_url: "https://www.therugbypaper.co.uk/news/injury",
      },
      {
        confidence: "medium",
        fact: "Kobe lineup features Retallick, Savea.",
        source_url: "https://www.therugbypaper.co.uk/news/lineup",
      },
    ]);

    expect(facts).toHaveLength(2);
    expect(facts.map((fact) => fact.fact)).toEqual([
      "Player X is out with a hamstring injury.",
      "Kobe lineup features Retallick, Savea.",
    ]);
  });

  it("rejects facts unrelated to the match teams or kickoff date", () => {
    const rejected: SourcedFactRejection[] = [];
    const facts = filterAllowedSourcedFacts(
      [
        {
          confidence: "medium",
          fact: "2026年6月25日、リポビタンDチャレンジカップ2026のマオリ・オールブラックス戦に出場する JAPAN XV の試合登録メンバーが発表されました。",
          source_url: "https://www.rugby-japan.jp/news/japan-xv",
        },
        {
          confidence: "medium",
          fact: "Japan will meet Australia on 2026年8月8日 after a squad update on 2026年6月25日.",
          source_url: "https://www.rugby-japan.jp/news/japan-australia",
        },
        {
          confidence: "medium",
          fact: "2026年6月26日、名古屋でマオリ・オールブラックス戦に向けたキャプテンズランが行われました。",
          source_url: "https://www.rugby-rp.com/news/captains-run",
        },
      ],
      {
        rejected,
        relevance: {
          kickoffAt: "2026-08-08T10:05:00.000Z",
          teamNames: [
            "Japan",
            "日本",
            "日本代表",
            "Australia",
            "オーストラリア",
          ],
        },
      },
    );

    expect(facts).toEqual([]);
    expect(rejected).toEqual([
      expect.objectContaining({ reason: "unrelated_fixture" }),
      expect.objectContaining({ reason: "unrelated_fixture" }),
      expect.objectContaining({ reason: "unrelated_fixture" }),
    ]);
  });

  it("keeps team-name variants and accepts either fact language", () => {
    const rejected: SourcedFactRejection[] = [];
    const facts = filterAllowedSourcedFacts(
      [
        {
          confidence: "medium",
          fact: "JAPAN XV have named a training squad for the upcoming fixture.",
          source_url: "https://www.rugby-japan.jp/news/japan-xv",
        },
        {
          confidence: "medium",
          fact: "The squad announcement is available.",
          fact_ja: "日本代表はオーストラリア戦に向けてメンバーを発表した。",
          source_url: "https://www.rugby-japan.jp/news/japan-australia",
        },
        {
          confidence: "medium",
          fact: "Japan released a squad update on 2026年7月25日.",
          source_url: "https://www.rugby-japan.jp/news/japan-squad",
        },
      ],
      {
        rejected,
        relevance: {
          kickoffAt: "2026-08-08T10:05:00.000Z",
          teamNames: [
            "Japan",
            "日本",
            "日本代表",
            "Australia",
            "オーストラリア",
          ],
        },
      },
    );

    expect(facts).toHaveLength(3);
    expect(rejected).toEqual([]);
  });

  it("uses every extracted date when checking the relevance window", () => {
    expect(
      extractSourcedFactDates(
        "Japan play Australia on 2026年8月8日 after a June 25, 2026 squad announcement.",
      ).map((date) => date.toISOString()),
    ).toEqual(["2026-08-08T00:00:00.000Z", "2026-06-25T00:00:00.000Z"]);
  });
});

describe("buildSearchPrompt", () => {
  it("uses sourced facts prompt version 1.4.0", () => {
    expect(SEARCH_PROMPT_VERSION).toBe("sourced-facts@1.4.0");
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
    expect(prompt).toContain('"fact_ja":"..."');
    expect(prompt).toContain("natural Japanese news-style paraphrase");
    expect(prompt).toContain("must only restate the information in fact");
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
    expect(prompt).toContain('"fact_ja":"..."');
    expect(prompt).toContain("natural Japanese news-style paraphrase");
    expect(prompt).toContain("must only restate the information in fact");

    const recapPrompt = buildSearchPrompt(leagueOneMatch, "recap");
    expect(recapPrompt).not.toContain("how the previous meeting");
  });

  it("derives allowed source domains from the supplied allowlist", () => {
    const defaultPrompt = buildSearchPrompt(leagueOneMatch, "preview");
    const reducedDomains = SOURCED_FACT_ALLOWED_DOMAINS.slice(0, -1);
    const reducedPrompt = buildSearchPrompt(
      leagueOneMatch,
      "preview",
      reducedDomains,
    );
    const extendedPrompt = buildSearchPrompt(leagueOneMatch, "preview", [
      ...SOURCED_FACT_ALLOWED_DOMAINS,
      "example-rugby.test",
    ]);

    expect(defaultPrompt).toContain(SOURCED_FACT_ALLOWED_DOMAINS.join(", "));
    expect(defaultPrompt).toContain("wikipedia.org");
    expect(defaultPrompt).not.toContain("rugbypass.com");
    expect(defaultPrompt).not.toContain("planetrugby.com");
    expect(reducedPrompt).not.toContain(
      SOURCED_FACT_ALLOWED_DOMAINS[SOURCED_FACT_ALLOWED_DOMAINS.length - 1] ??
        "",
    );
    expect(extendedPrompt).toContain("example-rugby.test");
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

  it("enables regular-round matches for all supported overseas families", () => {
    const families = [
      "premiership",
      "urc",
      "top-14",
      "super-rugby-pacific",
      "six-nations",
      "rugby-championship",
      "pnc",
      "autumn-nations",
      "rwc",
    ];

    for (const family of families) {
      expect(
        isSourcedFactsEnabledForMatch({
          ...leagueOneMatch,
          competition: {
            family,
            name: family,
            season: "2025-26",
          },
          external_ids: { round_name: "Round 12" },
        }),
      ).toBe(true);
    }
  });
});

describe("parseSourcedFactsResponse", () => {
  const allowedFact = {
    confidence: "medium",
    fact: "Malcolm Marx is expected to miss the final through injury.",
    source_url: "https://www.therugbypaper.co.uk/news/marx",
  };

  it("extracts facts from a plain JSON string", () => {
    const facts = parseSourcedFactsResponse(
      JSON.stringify({ facts: [allowedFact] }),
    );

    expect(facts).toHaveLength(1);
    expect(facts[0]?.source_domain).toBe("therugbypaper.co.uk");
  });

  it("keeps a non-empty fact_ja and ignores blank fact_ja values", () => {
    const facts = parseSourcedFactsResponse(
      JSON.stringify({
        facts: [
          {
            ...allowedFact,
            fact_ja:
              "マルコム・マークスはハムストリング負傷により決勝戦を欠場する見込みだ。",
          },
          {
            ...allowedFact,
            fact: "A second eligible source reports an unchanged squad.",
            fact_ja: "   ",
          },
        ],
      }),
    );

    expect(facts[0]?.fact_ja).toBe(
      "マルコム・マークスはハムストリング負傷により決勝戦を欠場する見込みだ。",
    );
    expect(facts[1]?.fact_ja).toBeUndefined();
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
    expect(facts[0]?.source_domain).toBe("therugbypaper.co.uk");
  });
});

describe("fetchSourcedFactsForMatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.matchSingle.mockResolvedValue({ data: leagueOneMatch, error: null });
    dbMock.upsert.mockResolvedValue({ error: null });
  });

  it("uses cached facts without calling web search inside the freshness window", async () => {
    const cachedRows = [cachedFact()];
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

  it("excludes non-allowlisted cached facts and logs their count", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cachedRows = [
      cachedFact(),
      cachedFact({ source_domain: "allblacks.com" }),
      cachedFact({ source_domain: "" }),
      cachedFact({ source_domain: null }),
    ];
    dbMock.from.mockReturnValue(createSourcedFactsBuilder(cachedRows));

    await expect(
      loadSourcedFactsForMatch("match-1", "preview"),
    ).resolves.toEqual([cachedRows[0]]);
    expect(warn).toHaveBeenCalledWith(
      "[sourced-facts] Excluded 3 non-allowlisted cached fact(s) for match_id=match-1.",
    );

    warn.mockRestore();
  });

  it("returns no cached facts when every source is excluded", async () => {
    const cachedRows = [cachedFact({ source_domain: "allblacks.com" })];
    dbMock.from.mockReturnValue(createSourcedFactsBuilder(cachedRows));

    await expect(
      loadSourcedFactsForMatch("match-1", "preview"),
    ).resolves.toEqual([]);
  });

  it("uses current-version recap cached facts without calling web search", async () => {
    const cachedRows = [
      cachedFact({
        content_type: "recap",
        fetched_at: "2026-06-09T12:00:00.000Z",
      }),
    ];
    dbMock.from.mockImplementation((table: string) => {
      if (table === "matches") return createMatchBuilder();
      if (table === "match_sourced_facts") {
        return createSourcedFactsBuilder(cachedRows);
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await fetchSourcedFactsForMatch({
      contentType: "recap",
      matchId: "match-1",
      now: new Date("2026-06-11T18:00:00.000Z"),
    });

    expect(result.cached).toBe(true);
    expect(result.facts).toHaveLength(1);
    expect(openAIMock.createWebSearchJsonResponse).not.toHaveBeenCalled();
  });

  it("refetches recap cached facts from stale prompt versions", async () => {
    const cachedRows = [
      cachedFact({
        content_type: "recap",
        metadata: { prompt_version: "sourced-facts@1.2.0" },
      }),
    ];
    dbMock.from.mockImplementation((table: string) => {
      if (table === "matches") return createMatchBuilder();
      if (table === "match_sourced_facts") {
        return createSourcedFactsBuilder(cachedRows);
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    openAIMock.createWebSearchJsonResponse.mockResolvedValue({
      model: "gpt-4o-2024-11-20",
      text: JSON.stringify({
        facts: [
          {
            confidence: "medium",
            fact: "Kobe Steelers and Kubota Spears both conceded nine penalties.",
            source_url: "https://www.therugbypaper.co.uk/news/penalties",
          },
        ],
      }),
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await fetchSourcedFactsForMatch({
      contentType: "recap",
      matchId: "match-1",
      now: new Date("2026-06-09T18:00:00.000Z"),
    });

    expect(result.cached).toBe(false);
    expect(result.fetched).toBe(true);
    expect(openAIMock.createWebSearchJsonResponse).toHaveBeenCalledOnce();
    expect(dbMock.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          metadata: expect.objectContaining({
            prompt_version: SEARCH_PROMPT_VERSION,
          }),
        }),
      ],
      { onConflict: "match_id,fact" },
    );
  });

  it("retries a recap search once when the first response has no allowed facts", async () => {
    dbMock.from.mockImplementation((table: string) => {
      if (table === "matches") return createMatchBuilder();
      if (table === "match_sourced_facts") {
        return createSourcedFactsBuilder([]);
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    openAIMock.createWebSearchJsonResponse
      .mockResolvedValueOnce({
        model: "gpt-4o-2024-11-20",
        text: JSON.stringify({ facts: [] }),
        usage: { inputTokens: 10, outputTokens: 10 },
      })
      .mockResolvedValueOnce({
        model: "gpt-4o-2024-11-20",
        text: JSON.stringify({
          facts: [
            {
              confidence: "medium",
              fact: "Kobe Steelers made fewer handling errors after halftime.",
              source_url: "https://www.therugbypaper.co.uk/news/japan-recap",
            },
          ],
        }),
        usage: { inputTokens: 10, outputTokens: 10 },
      });

    const result = await fetchSourcedFactsForMatch({
      contentType: "recap",
      force: true,
      matchId: "match-1",
      now: new Date("2026-06-09T18:00:00.000Z"),
    });

    expect(openAIMock.createWebSearchJsonResponse).toHaveBeenCalledTimes(2);
    expect(openAIMock.createWebSearchJsonResponse.mock.calls[1]?.[0]).toEqual(
      openAIMock.createWebSearchJsonResponse.mock.calls[0]?.[0],
    );
    expect(result.facts).toEqual([
      expect.objectContaining({
        fact: "Kobe Steelers made fewer handling errors after halftime.",
      }),
    ]);
  });

  it("retries a recap search once when non-empty facts have no statistical fact", async () => {
    dbMock.from.mockImplementation((table: string) => {
      if (table === "matches") return createMatchBuilder();
      if (table === "match_sourced_facts") {
        return createSourcedFactsBuilder([]);
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    openAIMock.createWebSearchJsonResponse
      .mockResolvedValueOnce({
        model: "gpt-4o-2024-11-20",
        text: JSON.stringify({
          facts: [
            {
              confidence: "medium",
              fact: "The head coach praised Kobe Steelers' response after halftime.",
              source_url: "https://www.therugbypaper.co.uk/news/japan-recap",
            },
          ],
        }),
        usage: { inputTokens: 10, outputTokens: 10 },
      })
      .mockResolvedValueOnce({
        model: "gpt-4o-2024-11-20",
        text: JSON.stringify({
          facts: [
            {
              confidence: "medium",
              fact: "Kobe Steelers made 82% of their tackles while Kubota Spears made 90%.",
              source_url: "https://www.therugbypaper.co.uk/news/japan-stats",
            },
          ],
        }),
        usage: { inputTokens: 10, outputTokens: 10 },
      });

    const result = await fetchSourcedFactsForMatch({
      contentType: "recap",
      force: true,
      matchId: "match-1",
      now: new Date("2026-06-09T18:00:00.000Z"),
    });

    expect(openAIMock.createWebSearchJsonResponse).toHaveBeenCalledTimes(2);
    expect(result.facts).toEqual([
      expect.objectContaining({
        fact: "Kobe Steelers made 82% of their tackles while Kubota Spears made 90%.",
      }),
    ]);
  });

  it("does not retry a recap search when one fact contains statistics", async () => {
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
            fact: "Kobe Steelers conceded nine penalties in the first half.",
            source_url: "https://www.therugbypaper.co.uk/news/japan-penalties",
          },
          {
            confidence: "medium",
            fact: "The coach praised Kobe Steelers' composure after halftime.",
            source_url: "https://www.therugbypaper.co.uk/news/japan-coach",
          },
        ],
      }),
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    await fetchSourcedFactsForMatch({
      contentType: "recap",
      force: true,
      matchId: "match-1",
      now: new Date("2026-06-09T18:00:00.000Z"),
    });

    expect(openAIMock.createWebSearchJsonResponse).toHaveBeenCalledOnce();
  });

  it("returns an empty result after the recap retry also has no allowed facts", async () => {
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

    const result = await fetchSourcedFactsForMatch({
      contentType: "recap",
      force: true,
      matchId: "match-1",
      now: new Date("2026-06-09T18:00:00.000Z"),
    });

    expect(openAIMock.createWebSearchJsonResponse).toHaveBeenCalledTimes(2);
    expect(result.facts).toEqual([]);
    expect(dbMock.upsert).not.toHaveBeenCalled();
  });

  it("does not retry a preview search when non-empty facts have no statistics", async () => {
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
            fact: "The head coach praised Kobe Steelers' preparation this week.",
            source_url: "https://www.therugbypaper.co.uk/news/preview",
          },
        ],
      }),
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    await fetchSourcedFactsForMatch({
      contentType: "preview",
      force: true,
      matchId: "match-1",
      now: new Date("2026-06-09T18:00:00.000Z"),
    });

    expect(openAIMock.createWebSearchJsonResponse).toHaveBeenCalledOnce();
  });

  it("refetches cached facts with missing prompt version metadata", async () => {
    const cachedRows = [
      cachedFact({
        content_type: "recap",
        metadata: null,
      }),
    ];
    dbMock.from.mockImplementation((table: string) => {
      if (table === "matches") return createMatchBuilder();
      if (table === "match_sourced_facts") {
        return createSourcedFactsBuilder(cachedRows);
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    openAIMock.createWebSearchJsonResponse.mockResolvedValue({
      model: "gpt-4o-2024-11-20",
      text: JSON.stringify({ facts: [] }),
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await fetchSourcedFactsForMatch({
      contentType: "recap",
      matchId: "match-1",
      now: new Date("2026-06-09T18:00:00.000Z"),
    });

    expect(result.cached).toBe(false);
    expect(result.fetched).toBe(true);
    expect(openAIMock.createWebSearchJsonResponse).toHaveBeenCalledTimes(2);
  });

  it("keeps preview freshness expiry even when cached prompt version is current", async () => {
    const cachedRows = [
      cachedFact({
        content_type: "preview",
        fetched_at: "2026-06-08T12:00:00.000Z",
      }),
    ];
    dbMock.from.mockImplementation((table: string) => {
      if (table === "matches") return createMatchBuilder();
      if (table === "match_sourced_facts") {
        return createSourcedFactsBuilder(cachedRows);
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    openAIMock.createWebSearchJsonResponse.mockResolvedValue({
      model: "gpt-4o-2024-11-20",
      text: JSON.stringify({ facts: [] }),
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await fetchSourcedFactsForMatch({
      contentType: "preview",
      matchId: "match-1",
      now: new Date("2026-06-09T18:00:00.000Z"),
    });

    expect(result.cached).toBe(false);
    expect(result.fetched).toBe(true);
    expect(openAIMock.createWebSearchJsonResponse).toHaveBeenCalledOnce();
  });

  it("refetches preview cached facts from stale prompt versions inside the freshness window", async () => {
    const cachedRows = [
      cachedFact({
        content_type: "preview",
        metadata: { prompt_version: "sourced-facts@1.2.0" },
      }),
    ];
    dbMock.from.mockImplementation((table: string) => {
      if (table === "matches") return createMatchBuilder();
      if (table === "match_sourced_facts") {
        return createSourcedFactsBuilder(cachedRows);
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    openAIMock.createWebSearchJsonResponse.mockResolvedValue({
      model: "gpt-4o-2024-11-20",
      text: JSON.stringify({ facts: [] }),
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    const result = await fetchSourcedFactsForMatch({
      contentType: "preview",
      matchId: "match-1",
      now: new Date("2026-06-09T18:00:00.000Z"),
    });

    expect(result.cached).toBe(false);
    expect(result.fetched).toBe(true);
    expect(openAIMock.createWebSearchJsonResponse).toHaveBeenCalledOnce();
  });

  it("stores only allowlisted web-search facts", async () => {
    const consoleInfo = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
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
            fact: "Kobe Steelers expect Malcolm Marx to miss the final through injury.",
            source_url: "https://www.therugbypaper.co.uk/news/marx",
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
          fact: "Kobe Steelers expect Malcolm Marx to miss the final through injury.",
          source_domain: "therugbypaper.co.uk",
        }),
      ],
      { onConflict: "match_id,fact" },
    );
    expect(consoleInfo).toHaveBeenCalledWith(
      "Sourced facts rejected by disallowed domain",
      { "sportytrader.com": 1 },
    );
    consoleInfo.mockRestore();
  });

  it("stores recap fact_ja and normalizes missing or blank values to null", async () => {
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
            fact: "Kobe Steelers expect Malcolm Marx to miss the final through injury.",
            fact_ja:
              "コベルコ神戸スティーラーズは、マルコム・マークスが負傷により決勝戦を欠場する見込みだとした。",
            source_url: "https://www.therugbypaper.co.uk/news/marx",
          },
          {
            confidence: "medium",
            fact: "Kobe have named an unchanged squad for the final.",
            fact_ja: " ",
            source_url: "https://www.therugbypaper.co.uk/news/kobe-squad",
          },
        ],
      }),
      usage: { inputTokens: 10, outputTokens: 10 },
    });

    await fetchSourcedFactsForMatch({
      contentType: "recap",
      force: true,
      matchId: "match-1",
      now: new Date("2026-06-09T18:00:00.000Z"),
    });

    expect(dbMock.upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          fact: "Kobe Steelers expect Malcolm Marx to miss the final through injury.",
          fact_ja:
            "コベルコ神戸スティーラーズは、マルコム・マークスが負傷により決勝戦を欠場する見込みだとした。",
        }),
        expect.objectContaining({
          fact: "Kobe have named an unchanged squad for the final.",
          fact_ja: null,
        }),
      ]),
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
