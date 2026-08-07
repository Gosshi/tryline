import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  from: vi.fn(),
  sourcedFactsBuilder: {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: vi.fn(),
  },
}));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => ({
    from: dbMock.from,
  }),
}));

describe("story sourced facts query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.from.mockReturnValue(dbMock.sourcedFactsBuilder);
    dbMock.sourcedFactsBuilder.then.mockImplementation((resolve) =>
      Promise.resolve(
        resolve({
          data: [
            {
              confidence: "medium",
              content_type: "preview",
              fact: "England have named a changed front row.",
              fact_ja: "イングランドはフロントローを変更した布陣を発表した。",
              fetched_at: "2026-07-19T01:00:00.000Z",
              id: "fact-1",
              match_id: "match-1",
              source_domain: "en.wikipedia.org",
              source_url: "https://en.wikipedia.org/wiki/England_national_rugby_union_team",
            },
          ],
          error: null,
        }),
      ),
    );
  });

  it("selects and maps source_url for story sourced facts", async () => {
    const { getStorySourcedFactsForMatches } =
      await import("@/lib/db/queries/sourced-facts");

    const facts = await getStorySourcedFactsForMatches(["match-1"]);

    expect(dbMock.from).toHaveBeenCalledWith("match_sourced_facts");
    expect(dbMock.sourcedFactsBuilder.select).toHaveBeenCalledWith(
      expect.stringContaining("source_url"),
    );
    expect(dbMock.sourcedFactsBuilder.in).toHaveBeenCalledWith("match_id", [
      "match-1",
    ]);
    expect(dbMock.sourcedFactsBuilder.in).toHaveBeenCalledWith("content_type", [
      "preview",
      "recap",
      "shared",
    ]);
    expect(facts).toEqual([
      expect.objectContaining({
        sourceDomain: "en.wikipedia.org",
        sourceUrl: "https://en.wikipedia.org/wiki/England_national_rugby_union_team",
      }),
    ]);
  });

  it("returns without querying when there are no match ids", async () => {
    const { getStorySourcedFactsForMatches } =
      await import("@/lib/db/queries/sourced-facts");

    await expect(getStorySourcedFactsForMatches([])).resolves.toEqual([]);
    expect(dbMock.from).not.toHaveBeenCalled();
  });

  it("groups allowed sourced facts by content type and domain", async () => {
    dbMock.sourcedFactsBuilder.then.mockImplementation((resolve) =>
      Promise.resolve(
        resolve({
          data: [
            {
              confidence: "medium",
              content_type: "preview",
              source_domain: "en.wikipedia.org",
              source_url: "https://en.wikipedia.org/wiki/Rugby_union",
            },
            {
              confidence: "high",
              content_type: "preview",
              source_domain: "en.wikipedia.org",
              source_url: "https://en.wikipedia.org/wiki/Rugby_union_history",
            },
            {
              confidence: "medium",
              content_type: "shared",
              source_domain: "rugby-japan.jp",
              source_url: null,
            },
            {
              confidence: "medium",
              content_type: "recap",
              source_domain: "rugbypass.com",
              source_url: "https://www.rugbypass.com/example",
            },
          ],
          error: null,
        }),
      ),
    );
    const { getSourcedFactSummaryForMatch } =
      await import("@/lib/db/queries/sourced-facts");

    await expect(getSourcedFactSummaryForMatch("match-1")).resolves.toEqual({
      preview: 3,
      previewSources: [
        {
          domain: "en.wikipedia.org",
          sourceUrl: "https://en.wikipedia.org/wiki/Rugby_union",
        },
        { domain: "rugby-japan.jp", sourceUrl: null },
      ],
      recap: 1,
      recapSources: [{ domain: "rugby-japan.jp", sourceUrl: null }],
    });
  });
});
