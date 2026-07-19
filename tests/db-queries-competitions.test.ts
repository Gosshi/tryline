import { describe, expect, it, vi } from "vitest";

import { listSeasonsByFamilies } from "@/lib/db/queries/competitions";

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
    expect(result.get("six-nations")?.[0]?.publishedContentCount).toBe(2);
    expect(result.get("urc")?.[0]?.publishedContentCount).toBe(1);
  });
});
