// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { PRIMARY_SAMPLE_MATCH_ID } from "@/lib/sample-matches";

const authMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserProfile: vi.fn(),
}));

const competitionMocks = vi.hoisted(() => ({
  listFamilies: vi.fn(),
  listSeasonsByFamily: vi.fn(),
  selectLatestSeasonWithMatches: vi.fn(),
  sortHomepageCompetitionLinks: vi.fn(),
}));

const matchMocks = vi.hoisted(() => ({
  getFavoriteTeamMatches: vi.fn(),
  getMatchesInRange: vi.fn(),
  getRecentlyReviewedCompetitionGroups: vi.fn(),
  getRecentlyReviewedFamilies: vi.fn(),
  getRecentlyReviewedMatchById: vi.fn(),
  getUpcomingMatches: vi.fn(),
}));

vi.mock("@/components/calendar/week-schedule", () => ({
  WeekSchedule: ({ emptyMessage }: { emptyMessage: string }) => (
    <div>{emptyMessage}</div>
  ),
}));

vi.mock("@/components/checkout-success-tracker", () => ({
  CheckoutSuccessTracker: () => null,
}));

vi.mock("@/components/favorite-teams-banner", () => ({
  FavoriteTeamsBanner: () => null,
}));

vi.mock("@/components/hero-texture", () => ({
  HeroTexture: () => null,
}));

vi.mock("@/components/match-card", () => ({
  MatchCard: () => <div>Match card</div>,
}));

vi.mock("next/image", () => ({
  default: ({ alt }: { alt: string }) => <span>{alt}</span>,
}));

vi.mock("@/components/team-badge", () => ({
  TeamBadge: ({ shortCode }: { shortCode?: string | null }) => (
    <span>{shortCode}</span>
  ),
}));

vi.mock("@/lib/auth/server", () => ({
  getUser: authMocks.getUser,
  getUserProfile: authMocks.getUserProfile,
}));

vi.mock("@/lib/db/queries/competitions", () => ({
  listFamilies: competitionMocks.listFamilies,
  listSeasonsByFamily: competitionMocks.listSeasonsByFamily,
  selectLatestSeasonWithMatches: competitionMocks.selectLatestSeasonWithMatches,
  sortHomepageCompetitionLinks: competitionMocks.sortHomepageCompetitionLinks,
}));

vi.mock("@/lib/db/queries/matches", () => ({
  getFavoriteTeamMatches: matchMocks.getFavoriteTeamMatches,
  getMatchesInRange: matchMocks.getMatchesInRange,
  getRecentlyReviewedCompetitionGroups:
    matchMocks.getRecentlyReviewedCompetitionGroups,
  getRecentlyReviewedFamilies: matchMocks.getRecentlyReviewedFamilies,
  getRecentlyReviewedMatchById: matchMocks.getRecentlyReviewedMatchById,
  getUpcomingMatches: matchMocks.getUpcomingMatches,
}));

describe("HomePage", () => {
  beforeEach(() => {
    authMocks.getUser.mockResolvedValue(null);
    authMocks.getUserProfile.mockResolvedValue(null);
    competitionMocks.listFamilies.mockResolvedValue([]);
    competitionMocks.listSeasonsByFamily.mockResolvedValue([]);
    competitionMocks.selectLatestSeasonWithMatches.mockReturnValue(null);
    competitionMocks.sortHomepageCompetitionLinks.mockImplementation(
      (links) => links,
    );
    matchMocks.getRecentlyReviewedFamilies.mockResolvedValue([]);
    matchMocks.getRecentlyReviewedCompetitionGroups.mockResolvedValue([
      {
        compact: [],
        competition: { family: "urc", name: "URC", season: "2025-26", slug: "urc-2025-26" },
        hero: {
          awayScore: 21,
          awayTeam: {
            name: "Recent Away",
            shortCode: "RA",
            slug: "recent-away",
          },
          competition: { family: "urc", name: "URC", season: "2025-26", slug: "urc-2025-26" },
          homeScore: 24,
          homeTeam: {
            name: "Recent Home",
            shortCode: "RH",
            slug: "recent-home",
          },
          id: "recent-review-not-sample",
          recapExcerpt: "This recent review is not the free sample.",
        },
        latestReviewAt: "2026-07-06T06:30:00.000Z",
        poolName: null,
        round: 1,
        roundName: null,
      },
    ]);
    matchMocks.getRecentlyReviewedMatchById.mockResolvedValue({
      awayScore: 26,
      awayTeam: {
        name: "Gloucester",
        shortCode: "GLO",
        slug: "gloucester",
      },
      competition: { name: "Premiership", season: "2025-26" },
      homeScore: 33,
      homeTeam: {
        name: "Northampton",
        shortCode: "NOR",
        slug: "northampton",
      },
      id: PRIMARY_SAMPLE_MATCH_ID,
      recapExcerpt: "これは無料で読めるレビュー本文です。",
    });
    matchMocks.getMatchesInRange.mockResolvedValue([]);
    matchMocks.getUpcomingMatches.mockResolvedValue([]);
    matchMocks.getFavoriteTeamMatches.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("uses the configured free sample match for homepage sample links", async () => {
    render(await HomePage());

    expect(matchMocks.getRecentlyReviewedMatchById).toHaveBeenCalledWith(
      PRIMARY_SAMPLE_MATCH_ID,
      "ja",
    );
    expect(matchMocks.getRecentlyReviewedCompetitionGroups).toHaveBeenCalledWith("ja");
    expect(matchMocks.getRecentlyReviewedCompetitionGroups).toHaveBeenCalledTimes(1);

    for (const link of screen.getAllByRole("link", {
      name: /無料サンプルを読む/,
    })) {
      expect(link).toHaveAttribute(
        "href",
        `/matches/${PRIMARY_SAMPLE_MATCH_ID}`,
      );
    }
    expect(screen.getAllByText("Northampton vs Gloucester").length).toBe(2);
    expect(
      screen.getAllByText("これは無料で読めるレビュー本文です。").length,
    ).toBe(2);
    expect(
      screen.getByRole("link", { name: "今週の試合を見る" }),
    ).toHaveAttribute("href", "/calendar");
  });

  it("renders multiple recent review competition blocks", async () => {
    matchMocks.getRecentlyReviewedCompetitionGroups.mockResolvedValue([
      {
        compact: [
          {
            awayScore: 18,
            awayTeam: { name: "France", shortCode: "FRA", slug: "france" },
            competition: {
              family: "nations-championship",
              name: "Nations Championship",
              season: "2026",
              slug: "nations-championship-2026",
            },
            homeScore: 26,
            homeTeam: {
              name: "New Zealand",
              shortCode: "NZL",
              slug: "new-zealand",
            },
            id: "nz-france-compact",
            recapExcerpt: "compact",
          },
        ],
        competition: {
          family: "nations-championship",
          name: "Nations Championship",
          season: "2026",
          slug: "nations-championship-2026",
        },
        hero: {
          awayScore: 17,
          awayTeam: { name: "England", shortCode: "ENG", slug: "england" },
          competition: {
            family: "nations-championship",
            name: "Nations Championship",
            season: "2026",
            slug: "nations-championship-2026",
          },
          homeScore: 24,
          homeTeam: {
            name: "South Africa",
            shortCode: "RSA",
            slug: "south-africa",
          },
          id: "sa-england-hero",
          recapExcerpt: "hero",
        },
        latestReviewAt: "2026-07-06T06:30:00.000Z",
        poolName: null,
        round: 1,
        roundName: null,
      },
      {
        compact: [],
        competition: {
          family: "super-rugby-pacific",
          name: "Super Rugby Pacific",
          season: "2026",
          slug: "super-rugby-pacific-2026",
        },
        hero: {
          awayScore: 21,
          awayTeam: { name: "Chiefs", shortCode: "CHI", slug: "chiefs" },
          competition: {
            family: "super-rugby-pacific",
            name: "Super Rugby Pacific",
            season: "2026",
            slug: "super-rugby-pacific-2026",
          },
          homeScore: 31,
          homeTeam: {
            name: "Hurricanes",
            shortCode: "HUR",
            slug: "hurricanes",
          },
          id: "srp-hero",
          recapExcerpt: "srp",
        },
        latestReviewAt: "2026-07-05T06:30:00.000Z",
        poolName: null,
        round: 12,
        roundName: null,
      },
    ]);

    render(await HomePage());

    expect(
      screen.getByRole("link", { name: /South Africa[\s\S]*England/ }),
    ).toHaveAttribute("href", "/matches/sa-england-hero");
    expect(
      screen.getByRole("link", { name: /Hurricanes[\s\S]*Chiefs/ }),
    ).toHaveAttribute("href", "/matches/srp-hero");
    expect(
      screen.getByRole("link", { name: /NZL[\s\S]*26–18[\s\S]*FRA/ }),
    ).toHaveAttribute("href", "/matches/nz-france-compact");
  });

  it("keeps the RWC archive card on 2023 while adding the 2027 schedule link", async () => {
    competitionMocks.listFamilies.mockResolvedValue(["rwc", "six-nations"]);
    competitionMocks.listSeasonsByFamily.mockImplementation(
      (family: string) => {
        if (family === "rwc") {
          return Promise.resolve([
            {
              endDate: "2023-10-28",
              matchCount: 48,
              name: "Rugby World Cup 2023",
              season: "2023",
            },
          ]);
        }

        return Promise.resolve([
          {
            endDate: "2026-03-14",
            matchCount: 15,
            name: "Six Nations 2026",
            season: "2026",
          },
        ]);
      },
    );
    competitionMocks.selectLatestSeasonWithMatches.mockImplementation(
      (seasons) => seasons[0] ?? null,
    );

    render(await HomePage());

    expect(
      screen.getByRole("link", { name: /Rugby World Cup 2023 最新シーズン/ }),
    ).toHaveAttribute("href", "/c/rwc/2023");
    expect(
      screen.getByRole("link", {
        name: "2027年大会（オーストラリア開催）の日程はこちら →",
      }),
    ).toHaveAttribute("href", "/c/rwc/2027");
    expect(
      screen.getAllByRole("link", {
        name: "2027年大会（オーストラリア開催）の日程はこちら →",
      }),
    ).toHaveLength(1);
  });
});
