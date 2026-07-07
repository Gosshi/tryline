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
  getRecentlyReviewedFamilies: vi.fn(),
  getRecentlyReviewedMatchById: vi.fn(),
  getRecentlyReviewedMatches: vi.fn(),
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
  getRecentlyReviewedFamilies: matchMocks.getRecentlyReviewedFamilies,
  getRecentlyReviewedMatchById: matchMocks.getRecentlyReviewedMatchById,
  getRecentlyReviewedMatches: matchMocks.getRecentlyReviewedMatches,
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
    matchMocks.getRecentlyReviewedMatches.mockResolvedValue([
      {
        awayScore: 21,
        awayTeam: {
          name: "Recent Away",
          shortCode: "RA",
          slug: "recent-away",
        },
        competition: { name: "URC", season: "2025-26" },
        homeScore: 24,
        homeTeam: {
          name: "Recent Home",
          shortCode: "RH",
          slug: "recent-home",
        },
        id: "recent-review-not-sample",
        recapExcerpt: "This recent review is not the free sample.",
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
    expect(matchMocks.getRecentlyReviewedMatches).toHaveBeenCalledWith("ja");
    expect(matchMocks.getRecentlyReviewedMatches).toHaveBeenCalledTimes(1);

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
