// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { PRIMARY_SAMPLE_MATCH_ID } from "@/lib/sample-matches";

const authMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserProfile: vi.fn(),
  isProfilePremium: vi.fn(),
}));

const competitionMocks = vi.hoisted(() => ({
  listFamilies: vi.fn(),
  listSeasonsByFamilies: vi.fn(),
  listSeasonsByFamily: vi.fn(),
  selectLatestSeasonWithMatches: vi.fn(),
  sortHomepageCompetitionLinks: vi.fn(),
}));

const standingMocks = vi.hoisted(() => ({
  getStandingPositionLookupForCompetitions: vi.fn(),
}));

const teamMocks = vi.hoisted(() => ({
  listAllTeams: vi.fn(),
}));

const focusMocks = vi.hoisted(() => ({
  selectCalendarFocusMatchId: vi.fn(),
}));

const matchMocks = vi.hoisted(() => ({
  getFavoriteTeamMatches: vi.fn(),
  getMatchesInRange: vi.fn(),
  getNextMatchForCompetition: vi.fn(),
  getRecentlyReviewedCompetitionGroups: vi.fn(),
  getRecentlyReviewedFamilies: vi.fn(),
  getRecentlyReviewedMatchById: vi.fn(),
  getUpcomingMatches: vi.fn(),
}));

const spoilerGuardMocks = vi.hoisted(() => ({
  getSpoilerGuardEnabledForUser: vi.fn(),
}));

const sampleMatchMocks = vi.hoisted(() => ({
  getPrimarySampleMatchId: vi.fn(),
}));

vi.mock("@/components/calendar/week-schedule", () => ({
  WeekSchedule: ({ emptyMessage }: { emptyMessage: string }) => (
    <div>{emptyMessage}</div>
  ),
}));

vi.mock("@/components/checkout-success-tracker", () => ({
  CheckoutSuccessTracker: () => null,
}));

vi.mock("@/components/signup-success-tracker", () => ({
  SignupSuccessTracker: () => null,
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
  isProfilePremium: authMocks.isProfilePremium,
}));

vi.mock("@/lib/db/queries/competitions", () => ({
  listFamilies: competitionMocks.listFamilies,
  listSeasonsByFamilies: competitionMocks.listSeasonsByFamilies,
  listSeasonsByFamily: competitionMocks.listSeasonsByFamily,
  selectLatestSeasonWithMatches: competitionMocks.selectLatestSeasonWithMatches,
  sortHomepageCompetitionLinks: competitionMocks.sortHomepageCompetitionLinks,
}));

vi.mock("@/lib/db/queries/standings", () => ({
  getStandingPositionLookupForCompetitions:
    standingMocks.getStandingPositionLookupForCompetitions,
}));

vi.mock("@/lib/db/queries/teams", () => teamMocks);

vi.mock("@/lib/format/calendar-focus", () => ({
  selectCalendarFocusMatchId: focusMocks.selectCalendarFocusMatchId,
}));

vi.mock("@/lib/db/queries/matches", () => ({
  getFavoriteTeamMatches: matchMocks.getFavoriteTeamMatches,
  getMatchesInRange: matchMocks.getMatchesInRange,
  getNextMatchForCompetition: matchMocks.getNextMatchForCompetition,
  getRecentlyReviewedCompetitionGroups:
    matchMocks.getRecentlyReviewedCompetitionGroups,
  getRecentlyReviewedFamilies: matchMocks.getRecentlyReviewedFamilies,
  getRecentlyReviewedMatchById: matchMocks.getRecentlyReviewedMatchById,
  getUpcomingMatches: matchMocks.getUpcomingMatches,
}));

vi.mock("@/lib/db/queries/spoiler-guard", () => spoilerGuardMocks);

vi.mock("@/lib/sample-matches", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  getPrimarySampleMatchId: sampleMatchMocks.getPrimarySampleMatchId,
}));

function createCalendarMatch(overrides: Record<string, unknown> = {}) {
  return {
    awayScore: null,
    awayTeam: {
      id: "away-id",
      name: "Away Team",
      shortCode: "AWY",
      slug: "away-team",
      worldRanking: 8,
    },
    competition: {
      family: "six-nations",
      id: "six-nations-id",
      name: "Six Nations",
      season: "2026",
      slug: "six-nations-2026",
    },
    hasPreview: false,
    hasRecap: false,
    homeScore: null,
    homeTeam: {
      id: "home-id",
      name: "Home Team",
      shortCode: "HOM",
      slug: "home-team",
      worldRanking: 3,
    },
    id: "calendar-match",
    kickoffAt: "2026-07-18T09:00:00.000Z",
    poolName: null,
    round: null,
    roundName: null,
    status: "scheduled",
    venue: null,
    ...overrides,
  };
}

describe("HomePage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T03:00:00.000Z"));
    authMocks.getUser.mockResolvedValue(null);
    authMocks.getUserProfile.mockResolvedValue(null);
    authMocks.isProfilePremium.mockImplementation(
      (profile: { premium_until?: string | null } | null) =>
        profile?.premium_until != null &&
        new Date(profile.premium_until).getTime() > Date.now(),
    );
    competitionMocks.listFamilies.mockResolvedValue([]);
    competitionMocks.listSeasonsByFamily.mockResolvedValue([]);
    competitionMocks.listSeasonsByFamilies.mockImplementation(
      async (families: string[]) =>
        new Map(
          await Promise.all(
            families.map(async (family) =>
              [
                family,
                await competitionMocks.listSeasonsByFamily(family),
              ] as const,
            ),
          ),
        ),
    );
    competitionMocks.selectLatestSeasonWithMatches.mockReturnValue(null);
    competitionMocks.sortHomepageCompetitionLinks.mockImplementation(
      (links) => links,
    );
    standingMocks.getStandingPositionLookupForCompetitions.mockResolvedValue(
      new Map(),
    );
    teamMocks.listAllTeams.mockResolvedValue([]);
    focusMocks.selectCalendarFocusMatchId.mockReturnValue(null);
    sampleMatchMocks.getPrimarySampleMatchId.mockResolvedValue(
      PRIMARY_SAMPLE_MATCH_ID,
    );
    matchMocks.getRecentlyReviewedFamilies.mockResolvedValue([]);
    matchMocks.getRecentlyReviewedCompetitionGroups.mockResolvedValue([
      {
        compact: [],
        competition: {
          family: "urc",
          name: "URC",
          season: "2025-26",
          slug: "urc-2025-26",
        },
        hero: {
          awayScore: 21,
          awayTeam: {
            name: "Recent Away",
            shortCode: "RA",
            slug: "recent-away",
          },
          competition: {
            family: "urc",
            name: "URC",
            season: "2025-26",
            slug: "urc-2025-26",
          },
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
    matchMocks.getNextMatchForCompetition.mockResolvedValue(null);
    matchMocks.getUpcomingMatches.mockResolvedValue([]);
    matchMocks.getFavoriteTeamMatches.mockResolvedValue([]);
    spoilerGuardMocks.getSpoilerGuardEnabledForUser.mockResolvedValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("uses the configured free sample match for homepage sample links", async () => {
    const { container } = render(await HomePage());

    const heading = container.querySelector("h1");
    expect(heading).toHaveTextContent("今週の海外ラグビーを、日本時間で追う。");
    expect(heading?.querySelectorAll("wbr")).toHaveLength(3);
    expect(heading?.innerHTML).not.toContain("ラグビー<wbr>を");

    expect(matchMocks.getRecentlyReviewedMatchById).toHaveBeenCalledWith(
      PRIMARY_SAMPLE_MATCH_ID,
      "ja",
    );
    expect(
      matchMocks.getRecentlyReviewedCompetitionGroups,
    ).toHaveBeenCalledWith("ja");
    expect(
      matchMocks.getRecentlyReviewedCompetitionGroups,
    ).toHaveBeenCalledTimes(1);

    for (const link of screen.getAllByRole("link", {
      name: /無料サンプルを読む/,
    })) {
      expect(link).toHaveAttribute(
        "href",
        `/matches/${PRIMARY_SAMPLE_MATCH_ID}`,
      );
    }
    expect(screen.getAllByText("Northampton 対 Gloucester").length).toBe(1);
    expect(
      screen.getAllByText("これは無料で読めるレビュー本文です。").length,
    ).toBe(1);
    expect(screen.queryByLabelText("今週の注目試合")).not.toBeInTheDocument();
    expect(
      screen.queryByText("home_hero_sample_recap"),
    ).not.toBeInTheDocument();
    const heroLinks = screen.getAllByRole("link").slice(0, 2);
    expect(heroLinks[0]).toHaveTextContent("今週の試合を見る");
    expect(heroLinks[0]).toHaveAttribute("href", "/calendar");
    expect(heroLinks[1]).toHaveTextContent("Premium無料体験");
    expect(heroLinks[1]).toHaveAttribute("href", "/pricing");
  });

  it("renders the matchday board from current week matches", async () => {
    competitionMocks.listFamilies.mockResolvedValue(["nations-championship"]);
    competitionMocks.listSeasonsByFamily.mockResolvedValue([
      {
        endDate: "2026-11-29",
        matchCount: 36,
        name: "Nations Championship 2026",
        publishedContentCount: 12,
        season: "2026",
      },
    ]);
    competitionMocks.selectLatestSeasonWithMatches.mockImplementation(
      (seasons) => seasons[0] ?? null,
    );
    focusMocks.selectCalendarFocusMatchId.mockReturnValue("japan-match");
    matchMocks.getMatchesInRange.mockResolvedValue([
      createCalendarMatch({
        awayTeam: { name: "Ireland", shortCode: "IRE", slug: "ireland" },
        competition: {
          family: "nations-championship",
          id: "nations-championship-2026-id",
          name: "Nations Championship",
          season: "2026",
          slug: "nations-championship-2026",
        },
        hasPreview: true,
        homeTeam: { name: "Japan", shortCode: "JPN", slug: "japan" },
        id: "japan-match",
        kickoffAt: "2026-07-18T10:30:00.000Z",
      }),
      createCalendarMatch({ id: "quick-1" }),
      createCalendarMatch({ id: "quick-2" }),
      createCalendarMatch({ id: "quick-3" }),
      createCalendarMatch({ id: "quick-4" }),
    ]);
    matchMocks.getNextMatchForCompetition.mockResolvedValue(
      createCalendarMatch({
        awayTeam: { name: "Ireland", shortCode: "IRE", slug: "ireland" },
        competition: {
          family: "nations-championship",
          id: "nations-championship-2026-id",
          name: "Nations Championship",
          season: "2026",
          slug: "nations-championship-2026",
        },
        homeTeam: { name: "Japan", shortCode: "JPN", slug: "japan" },
        id: "nations-championship-next-match",
        kickoffAt: "2026-07-18T10:30:00.000Z",
      }),
    );

    render(await HomePage());

    expect(focusMocks.selectCalendarFocusMatchId).toHaveBeenCalled();
    expect(screen.getByLabelText("今週の注目試合")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Japan[\s\S]*Ireland/ }),
    ).toHaveAttribute("href", "/matches/japan-match");
    expect(
      screen.queryByRole("heading", { name: "今週の試合" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "注目大会" }),
    ).toBeInTheDocument();
    expect(screen.getByText("プレビュー公開")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ほか1試合 →" })).toHaveAttribute(
      "href",
      "/calendar",
    );
    expect(
      screen.getByRole("link", { name: "大会ページを見る →" }),
    ).toHaveAttribute("href", "/c/nations-championship/2026");
    expect(matchMocks.getNextMatchForCompetition).toHaveBeenCalledWith({
      family: "nations-championship",
      season: "2026",
    });
    expect(
      screen.getByText("ネーションズチャンピオンシップ 2026 を追う"),
    ).toBeInTheDocument();
    expect(screen.getByText("2026-07-18 (土) 19:30 JST")).toBeInTheDocument();
    expect(screen.getByText("Japan 対 Ireland")).toBeInTheDocument();
    expect(screen.getByText("12本")).toBeInTheDocument();
    expect(screen.getByText("1試合")).toBeInTheDocument();
    expect(
      screen.queryByText(/GSC|クリック|平均順位|表示回数/),
    ).not.toBeInTheDocument();
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
