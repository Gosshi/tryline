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
    expect(matchMocks.getRecentlyReviewedMatches).toHaveBeenCalledWith(3, "ja");
    expect(matchMocks.getRecentlyReviewedMatches).toHaveBeenCalledTimes(1);

    for (const link of screen.getAllByRole("link", {
      name: /無料サンプルを読む/,
    })) {
      expect(link).toHaveAttribute("href", `/matches/${PRIMARY_SAMPLE_MATCH_ID}`);
    }
    expect(screen.getAllByText("Northampton vs Gloucester").length).toBe(2);
    expect(
      screen.getAllByText("これは無料で読めるレビュー本文です。").length,
    ).toBe(2);
  });
});
