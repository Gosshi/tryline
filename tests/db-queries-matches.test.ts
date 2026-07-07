import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => clientMock,
}));

import {
  getRecentlyReviewedMatches,
  stripMarkdown,
} from "@/lib/db/queries/matches";

describe("stripMarkdown", () => {
  it("removes headings, bullets, and bold markers for recap excerpts", () => {
    const text = `# 試合全体像

- **Bath** が前半で主導権を握った

### ターニングポイント

**後半** は規律で差がついた。`;

    expect(stripMarkdown(text)).toBe(
      `試合全体像
Bath が前半で主導権を握った

ターニングポイント

後半 は規律で差がついた。`,
    );
  });

  it("collapses triple newlines", () => {
    expect(stripMarkdown("本文\n\n\n\n次段落")).toBe("本文\n\n次段落");
  });
});

const reviewQueryMock = {
  eq: vi.fn().mockReturnThis(),
  limit: vi.fn(),
  order: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
};

function buildReviewedContentRow(params: {
  family?: string;
  generatedAt: string;
  id: string;
  round?: number | string | null;
  season?: string;
}) {
  const family = params.family ?? "nations-championship";
  const season = params.season ?? "2026";

  return {
    content_md: `# Review\n\nRecap for ${params.id}.`,
    generated_at: params.generatedAt,
    match: {
      away_score: 10,
      away_team: {
        name: "Away Team",
        short_code: "AWY",
        slug: "away-team",
      },
      competition: {
        family,
        name: "Nations Championship",
        name_ja: null,
        season,
        slug: `${family}-${season}`,
      },
      external_ids:
        params.round === undefined || params.round === null
          ? {}
          : { wikipedia_round: params.round },
      home_score: 20,
      home_team: {
        name: "Home Team",
        short_code: "HOM",
        slug: "home-team",
      },
      id: params.id,
      kickoff_at: "2026-07-04T07:10:00.000Z",
      status: "finished",
      venue: "National Stadium",
    },
  };
}

describe("getRecentlyReviewedMatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMock.from.mockReturnValue(reviewQueryMock);
    reviewQueryMock.eq.mockReturnThis();
    reviewQueryMock.order.mockReturnThis();
    reviewQueryMock.select.mockReturnThis();
  });

  it("returns every published review from the latest competition season round", async () => {
    const latestRoundRows = Array.from({ length: 6 }, (_, index) =>
      buildReviewedContentRow({
        generatedAt: `2026-07-06T06:${String(25 - index).padStart(2, "0")}:00.000Z`,
        id: `nations-round-1-${index + 1}`,
        round: "1",
      }),
    );
    reviewQueryMock.limit.mockResolvedValue({
      data: [
        ...latestRoundRows,
        buildReviewedContentRow({
          family: "top-14",
          generatedAt: "2026-07-06T05:00:00.000Z",
          id: "top14-other-round",
          round: 1,
          season: "2025-26",
        }),
        buildReviewedContentRow({
          generatedAt: "2026-07-06T04:00:00.000Z",
          id: "nations-round-2",
          round: 2,
        }),
      ],
      error: null,
    });

    const matches = await getRecentlyReviewedMatches("ja");

    expect(clientMock.from).toHaveBeenCalledWith("match_content");
    expect(reviewQueryMock.eq).toHaveBeenCalledWith("language", "ja");
    expect(reviewQueryMock.limit).toHaveBeenCalledWith(40);
    expect(matches.map((match) => match.id)).toEqual([
      "nations-round-1-1",
      "nations-round-1-2",
      "nations-round-1-3",
      "nations-round-1-4",
      "nations-round-1-5",
      "nations-round-1-6",
    ]);
  });

  it("falls back to the latest single review when the latest match has no round", async () => {
    reviewQueryMock.limit.mockResolvedValue({
      data: [
        buildReviewedContentRow({
          generatedAt: "2026-07-06T06:30:00.000Z",
          id: "roundless-latest",
          round: null,
        }),
        buildReviewedContentRow({
          generatedAt: "2026-07-06T06:20:00.000Z",
          id: "same-family-round-1",
          round: 1,
        }),
      ],
      error: null,
    });

    await expect(getRecentlyReviewedMatches()).resolves.toMatchObject([
      { id: "roundless-latest" },
    ]);
  });

  it("caps unusually large latest-round groups at eight reviews", async () => {
    reviewQueryMock.limit.mockResolvedValue({
      data: Array.from({ length: 10 }, (_, index) =>
        buildReviewedContentRow({
          generatedAt: `2026-07-06T06:${String(50 - index).padStart(2, "0")}:00.000Z`,
          id: `oversized-round-${index + 1}`,
          round: 1,
        }),
      ),
      error: null,
    });

    const matches = await getRecentlyReviewedMatches();

    expect(matches).toHaveLength(8);
    expect(matches.map((match) => match.id)).toEqual([
      "oversized-round-1",
      "oversized-round-2",
      "oversized-round-3",
      "oversized-round-4",
      "oversized-round-5",
      "oversized-round-6",
      "oversized-round-7",
      "oversized-round-8",
    ]);
  });
});
