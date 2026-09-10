import { describe, expect, it, vi } from "vitest";

import {
  getCompetitionBySlug,
  listCompetitionScheduleCoverage,
  listSeasonsByFamily,
  listSeasonsByFamilies,
} from "@/lib/db/queries/competitions";

const dbMocks = vi.hoisted(() => ({
  from: vi.fn(),
  getSupabasePublicServerClient: vi.fn(),
}));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: dbMocks.getSupabasePublicServerClient,
}));

describe("listSeasonsByFamilies", () => {
  it("does not query published content when no families are requested", async () => {
    const result = await listSeasonsByFamilies([]);

    expect(result).toEqual(new Map());
    expect(dbMocks.getSupabasePublicServerClient).not.toHaveBeenCalled();
  });

  it("counts published content for every requested family with one shared query", async () => {
    const competitionQuery = {
      eq: vi.fn(),
      order: vi.fn(),
      select: vi.fn(),
    };
    const contentQuery = {
      eq: vi.fn(),
      select: vi.fn(),
    };
    const competitionResults = [
      {
        data: [
          {
            champion: null,
            end_date: "2026-03-14",
            family: "six-nations",
            id: "six-nations-2026",
            matches: [{ count: 15 }],
            name: "Six Nations",
            season: "2026",
            slug: "six-nations-2026",
            start_date: "2026-02-05",
          },
        ],
        error: null,
      },
      {
        data: [
          {
            champion: null,
            end_date: "2026-06-20",
            family: "urc",
            id: "urc-2025-26",
            matches: [{ count: 144 }],
            name: "URC",
            season: "2025-26",
            slug: "urc-2025-26",
            start_date: "2025-09-20",
          },
        ],
        error: null,
      },
    ];

    competitionQuery.select.mockReturnValue(competitionQuery);
    competitionQuery.eq.mockReturnValue(competitionQuery);
    competitionQuery.order.mockImplementation(() =>
      Promise.resolve(competitionResults.shift()),
    );
    contentQuery.select.mockReturnValue(contentQuery);
    contentQuery.eq.mockResolvedValue({
      data: [
        { matches: { competition_id: "six-nations-2026" } },
        { matches: [{ competition_id: "six-nations-2026" }] },
        { matches: { competition_id: "urc-2025-26" } },
      ],
      error: null,
    });
    dbMocks.from.mockImplementation((table: string) =>
      table === "competitions" ? competitionQuery : contentQuery,
    );
    dbMocks.getSupabasePublicServerClient.mockReturnValue({
      from: dbMocks.from,
    });

    const result = await listSeasonsByFamilies(["six-nations", "urc"]);

    expect(dbMocks.from).toHaveBeenCalledWith("match_content");
    expect(
      dbMocks.from.mock.calls.filter(([table]) => table === "match_content"),
    ).toHaveLength(1);
    expect(competitionQuery.select).toHaveBeenCalledWith("*, matches(count)");
    expect(result.get("six-nations")?.[0]?.publishedContentCount).toBe(2);
    expect(result.get("urc")?.[0]?.publishedContentCount).toBe(1);
  });
});

describe("replacement competitions", () => {
  const competitionRow = {
    champion: null,
    end_date: null,
    family: "rugby-championship",
    id: "rugby-championship-2026",
    matches: [{ count: 0 }],
    name: "Rugby Championship",
    name_ja: "ザ・ラグビーチャンピオンシップ",
    replacement_competition_id: "nations-championship-2026",
    season: "2026",
    season_status: "not_held" as const,
    slug: "rugby-championship-2026",
    start_date: null,
    total_rounds: null,
  };

  const replacementCompetition = {
    family: "nations-championship",
    id: "nations-championship-2026",
    name: "Nations Championship",
    name_ja: "ネーションズ・チャンピオンシップ",
    season: "2026",
    slug: "nations-championship-2026",
  };

  it("loads a family replacement with a separate query", async () => {
    const seasonsQuery = { eq: vi.fn(), order: vi.fn(), select: vi.fn() };
    const contentQuery = { eq: vi.fn(), select: vi.fn() };
    const replacementsQuery = { in: vi.fn(), select: vi.fn() };

    seasonsQuery.select.mockReturnValue(seasonsQuery);
    seasonsQuery.eq.mockReturnValue(seasonsQuery);
    seasonsQuery.order.mockResolvedValue({ data: [competitionRow], error: null });
    contentQuery.select.mockReturnValue(contentQuery);
    contentQuery.eq.mockResolvedValue({ data: [], error: null });
    replacementsQuery.select.mockReturnValue(replacementsQuery);
    replacementsQuery.in.mockResolvedValue({
      data: [replacementCompetition],
      error: null,
    });
    let competitionQueryCalls = 0;
    dbMocks.from.mockImplementation((table: string) => {
      if (table === "match_content") {
        return contentQuery;
      }

      competitionQueryCalls += 1;
      return competitionQueryCalls === 1 ? seasonsQuery : replacementsQuery;
    });
    dbMocks.getSupabasePublicServerClient.mockReturnValue({ from: dbMocks.from });

    await expect(listSeasonsByFamily("rugby-championship")).resolves.toMatchObject([
      {
        replacementCompetition: {
          family: "nations-championship",
          name: "Nations Championship",
          nameJa: "ネーションズ・チャンピオンシップ",
          season: "2026",
          slug: "nations-championship-2026",
        },
      },
    ]);
    expect(seasonsQuery.select).toHaveBeenCalledWith("*, matches(count)");
    expect(replacementsQuery.select).toHaveBeenCalledWith(
      "id, slug, name, name_ja, family, season",
    );
    expect(replacementsQuery.in).toHaveBeenCalledWith("id", [
      "nations-championship-2026",
    ]);
  });

  it("loads a single competition replacement with a separate query", async () => {
    const competitionQuery = { eq: vi.fn(), maybeSingle: vi.fn(), select: vi.fn() };
    const replacementsQuery = { in: vi.fn(), select: vi.fn() };

    competitionQuery.select.mockReturnValue(competitionQuery);
    competitionQuery.eq.mockReturnValue(competitionQuery);
    competitionQuery.maybeSingle.mockResolvedValue({ data: competitionRow, error: null });
    replacementsQuery.select.mockReturnValue(replacementsQuery);
    replacementsQuery.in.mockResolvedValue({
      data: [replacementCompetition],
      error: null,
    });
    let competitionQueryCalls = 0;
    dbMocks.from.mockImplementation(() => {
      competitionQueryCalls += 1;
      return competitionQueryCalls === 1 ? competitionQuery : replacementsQuery;
    });
    dbMocks.getSupabasePublicServerClient.mockReturnValue({ from: dbMocks.from });

    await expect(getCompetitionBySlug("rugby-championship-2026")).resolves.toMatchObject({
      replacementCompetition: {
        family: "nations-championship",
        name: "Nations Championship",
        nameJa: "ネーションズ・チャンピオンシップ",
        season: "2026",
        slug: "nations-championship-2026",
      },
    });
    expect(competitionQuery.select).toHaveBeenCalledWith("*, matches(count)");
    expect(replacementsQuery.in).toHaveBeenCalledWith("id", [
      "nations-championship-2026",
    ]);
  });
});

describe("listCompetitionScheduleCoverage", () => {
  it("counts distinct normalized rounds instead of the maximum round number", async () => {
    const coverageQuery = {
      not: vi.fn(),
      select: vi.fn(),
    };
    coverageQuery.select.mockReturnValue(coverageQuery);
    coverageQuery.not.mockResolvedValue({
      data: [
        {
          family: "premiership",
          competition_standings: Array.from({ length: 10 }, (_, index) => ({
            team_id: `team-${index}`,
          })),
          matches: [
            { external_ids: { wikipedia_round: 1 } },
            { external_ids: { wikipedia_round: 2 } },
            { external_ids: { wikipedia_round: 18 } },
          ],
          name: "Premiership Rugby",
          name_ja: null,
          season: "2026-27",
          slug: "premiership-2026-27",
          total_rounds: 18,
        },
      ],
      error: null,
    });
    dbMocks.from.mockReturnValue(coverageQuery);
    dbMocks.getSupabasePublicServerClient.mockReturnValue({
      from: dbMocks.from,
    });

    await expect(listCompetitionScheduleCoverage()).resolves.toEqual([
      {
        family: "premiership",
        ingestedRoundCount: 3,
        missingFixtures: null,
        missingRounds: 15,
        name: "Premiership Rugby",
        nameJa: null,
        season: "2026-27",
        slug: "premiership-2026-27",
        totalRounds: 18,
      },
    ]);
    expect(coverageQuery.select).toHaveBeenCalledWith(
      "family, slug, name, name_ja, season, total_rounds, matches(external_ids), competition_standings(team_id)",
    );
    expect(coverageQuery.not).toHaveBeenCalledWith("total_rounds", "is", null);
  });
});
