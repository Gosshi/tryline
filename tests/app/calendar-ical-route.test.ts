import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import type { CalendarMatch } from "@/lib/db/queries/matches";

const matchQueryMock = vi.hoisted(() => ({
  getMatchesInRange: vi.fn(),
}));
const competitionQueryMock = vi.hoisted(() => ({
  getCompetitionBySlug: vi.fn(),
}));

vi.mock("@/lib/db/queries/matches", () => matchQueryMock);
vi.mock("@/lib/db/queries/competitions", () => competitionQueryMock);
vi.mock("@/lib/site", () => ({
  SITE_URL: "https://www.trylinerugby.com",
}));

function createCalendarMatch(
  overrides: Partial<CalendarMatch> = {},
): CalendarMatch {
  return {
    awayScore: null,
    awayTeam: {
      id: "away-id",
      name: "England",
      nameJa: "イングランド",
      shortCode: "ENG",
      slug: "england",
      worldRanking: null,
    },
    competition: {
      family: "nations-championship",
      id: "competition-id",
      name: "Nations Championship",
      nameJa: null,
      season: "2026",
      slug: "nations-championship",
    },
    hasBroadcasts: false,
    hasPreview: false,
    hasRecap: false,
    homeScore: null,
    homeTeam: {
      id: "home-id",
      name: "Japan",
      nameJa: "日本",
      shortCode: "JPN",
      slug: "japan",
      worldRanking: null,
    },
    id: "match-1",
    kickoffAt: "2026-11-07T10:30:00.000Z",
    poolName: null,
    round: 1,
    roundName: "Round 1",
    status: "scheduled",
    venue: "Tokyo Stadium",
    ...overrides,
  };
}

describe("/api/calendar/[feed].ics", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T00:00:00.000Z"));
    matchQueryMock.getMatchesInRange.mockResolvedValue([
      createCalendarMatch(),
      createCalendarMatch({
        competition: {
          family: "six-nations",
          id: "six-nations-id",
          name: "Six Nations",
          nameJa: null,
          season: "2027",
          slug: "six-nations-2027",
        },
        id: "match-2",
      }),
    ]);
    competitionQueryMock.getCompetitionBySlug.mockResolvedValue({
      champion: null,
      endDate: "2026-11-28",
      family: "nations-championship",
      id: "competition-id",
      matchCount: 15,
      name: "Nations Championship",
      nameJa: null,
      publishedContentCount: 0,
      season: "2026",
      slug: "nations-championship",
      startDate: "2026-11-07",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("returns an all-match iCal feed with JST event times", async () => {
    const { GET } = await import("@/app/api/calendar/[feed]/route");
    const response = await GET(
      new Request("https://example.com/api/calendar/all.ics"),
      {
        params: Promise.resolve({ feed: "all.ics" }),
      },
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    expect(matchQueryMock.getMatchesInRange).toHaveBeenCalledWith(
      "2026-07-10T00:00:00.000Z",
      "2027-07-15T00:00:00.000Z",
    );
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("TZID:Asia/Tokyo");
    expect(body).toContain("DTSTART;TZID=Asia/Tokyo:20261107T193000");
    expect(body).toContain("SUMMARY:日本 vs イングランド");
    expect(body).toContain("URL:https://www.trylinerugby.com/matches/match-1");
  });

  it("filters competition feeds by slug", async () => {
    const { GET } = await import("@/app/api/calendar/[feed]/route");
    const response = await GET(
      new Request("https://example.com/api/calendar/nations-championship.ics"),
      {
        params: Promise.resolve({ feed: "nations-championship.ics" }),
      },
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(competitionQueryMock.getCompetitionBySlug).toHaveBeenCalledWith(
      "nations-championship",
    );
    expect(body).toContain("UID:match-1@trylinerugby.com");
    expect(body).not.toContain("UID:match-2@trylinerugby.com");
  });

  it("returns 404 for unknown competition slugs", async () => {
    competitionQueryMock.getCompetitionBySlug.mockResolvedValue(null);

    const { GET } = await import("@/app/api/calendar/[feed]/route");
    const response = await GET(
      new Request("https://example.com/api/calendar/unknown.ics"),
      {
        params: Promise.resolve({ feed: "unknown.ics" }),
      },
    );

    await expect(response.json()).resolves.toEqual({
      error: "competition_not_found",
    });
    expect(response.status).toBe(404);
  });
});
