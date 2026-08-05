// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TeamPage, { generateMetadata } from "@/app/teams/[slug]/page";

const teamMocks = vi.hoisted(() => ({
  getTeamPageDataBySlug: vi.fn(),
}));

const contentMocks = vi.hoisted(() => ({
  getContentStatusMap: vi.fn(),
}));

const broadcastMocks = vi.hoisted(() => ({
  getMatchBroadcastsForMatches: vi.fn(),
}));

const playerMocks = vi.hoisted(() => ({
  getPlayersByTeamSlug: vi.fn(),
}));

const statsMocks = vi.hoisted(() => ({
  getTeamStatsDataBySlug: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserProfile: vi.fn(),
}));

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: navigationMocks.notFound,
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/auth/server", () => authMocks);

vi.mock("@/lib/db/queries/teams", () => ({
  getTeamPageDataBySlug: teamMocks.getTeamPageDataBySlug,
}));

vi.mock("@/lib/db/queries/match-content", () => ({
  getContentStatusMap: contentMocks.getContentStatusMap,
}));

vi.mock("@/lib/db/queries/match-broadcasts", () => broadcastMocks);

vi.mock("@/lib/db/queries/players", () => ({
  getPlayersByTeamSlug: playerMocks.getPlayersByTeamSlug,
}));

vi.mock("@/lib/db/queries/team-stats", () => ({
  getTeamStatsDataBySlug: statsMocks.getTeamStatsDataBySlug,
}));

describe("TeamPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    navigationMocks.notFound.mockReset();
    navigationMocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    teamMocks.getTeamPageDataBySlug.mockReset();
    playerMocks.getPlayersByTeamSlug.mockReset();
    statsMocks.getTeamStatsDataBySlug.mockReset();
    contentMocks.getContentStatusMap.mockReset();
    broadcastMocks.getMatchBroadcastsForMatches.mockReset();
    authMocks.getUser.mockReset();
    authMocks.getUserProfile.mockReset();
    authMocks.getUser.mockResolvedValue({ id: "user-1" });
    authMocks.getUserProfile.mockResolvedValue({ favorite_team_slugs: [] });
    contentMocks.getContentStatusMap.mockResolvedValue(new Map());
    broadcastMocks.getMatchBroadcastsForMatches.mockResolvedValue(
      new Map([
        [
          "match-2",
          [
            {
              displayOrder: 0,
              kind: "streaming",
              serviceName: "J SPORTSオンデマンド",
              sourceUrl: null,
              url: "https://example.com/watch",
              verifiedAt: "2026-07-20T00:00:00.000Z",
            },
          ],
        ],
      ]),
    );
    playerMocks.getPlayersByTeamSlug.mockResolvedValue([
      {
        name: "Ben Spencer",
        position: "Scrum-half",
        slug: "ben-spencer",
      },
    ]);
    statsMocks.getTeamStatsDataBySlug.mockResolvedValue({
      record: {
        draws: 1,
        form: ["W", "L", "D"],
        losses: 2,
        matchCount: 8,
        pointsAgainst: 160,
        pointsFor: 210,
        wins: 5,
      },
      scoring: {
        matchCount: 4,
        penaltyGoalsPerMatch: 1.5,
        pointsForPerMatch: 26.3,
        triesPerMatch: 3.2,
      },
      topScorers: [
        {
          conversions: 8,
          penalties: 2,
          playerName: "Finn Russell",
          points: 42,
          tries: 4,
        },
      ],
    });
    teamMocks.getTeamPageDataBySlug.mockResolvedValue({
      recentMatches: [
        {
          awayScore: 17,
          awayTeam: { name: "Leinster", shortCode: "LEI", slug: "leinster" },
          competition: {
            name: "Champions Cup",
            season: "2026",
            slug: "champions-cup-2026",
          },
          homeScore: 24,
          homeTeam: { name: "Bath", shortCode: "BAT", slug: "bath" },
          id: "match-1",
          kickoffAt: "2026-05-10T14:00:00.000Z",
          round: 1,
          status: "finished",
          venue: "The Rec",
        },
      ],
      team: {
        country: "ENG",
        name: "Bath",
        nameJa: "バース",
        shortCode: "BAT",
        slug: "bath",
      },
      upcomingMatches: [
        {
          awayScore: null,
          awayTeam: {
            name: "Sale Sharks",
            shortCode: "SAL",
            slug: "sale-sharks",
          },
          competition: {
            name: "Premiership Rugby",
            season: "2026-27",
            slug: "premiership-2026-27",
          },
          homeScore: null,
          homeTeam: { name: "Bath", shortCode: "BAT", slug: "bath" },
          id: "match-2",
          kickoffAt: "2026-09-10T14:00:00.000Z",
          round: 1,
          status: "scheduled",
          venue: "The Rec",
        },
      ],
    });
  });

  it("renders Japanese team names and upcoming matches before recent matches", async () => {
    const { container } = render(
      await TeamPage({ params: Promise.resolve({ slug: "bath" }) }),
    );

    expect(screen.getByRole("link", { name: "Tryline" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByLabelText("パンくずリスト"),
    ).toHaveTextContent("バース");
    expect(
      screen.getByRole("heading", { level: 1, name: "バース" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "バースを追う" })).toBeInTheDocument();
    expect(screen.getByText("ENG")).toBeInTheDocument();
    const upcomingHeading = screen.getByText("次戦");
    const recentHeading = screen.getByText("直近の試合");
    expect(upcomingHeading.compareDocumentPosition(recentHeading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByText("チームスタッツ")).toBeInTheDocument();
    expect(screen.getByText("Finn Russell")).toBeInTheDocument();
    expect(screen.getByText("Ben Spencer")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /Bath/ }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("J SPORTSオンデマンド")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /J SPORTSオンデマンド/ })).toHaveAttribute(
      "target",
      "_blank",
    );
    expect(container.querySelector("a a")).toBeNull();
  });

  it("falls back to the English team name and hides empty upcoming matches", async () => {
    authMocks.getUser.mockResolvedValue({ id: "user-1" });
    authMocks.getUserProfile.mockResolvedValue({ favorite_team_slugs: [] });
    teamMocks.getTeamPageDataBySlug.mockResolvedValue({
      recentMatches: [],
      team: {
        country: "ENG",
        name: "Bath",
        nameJa: null,
        shortCode: "BAT",
        slug: "bath",
      },
      upcomingMatches: [],
    });

    render(await TeamPage({ params: Promise.resolve({ slug: "bath" }) }));

    expect(screen.getByLabelText("パンくずリスト")).toHaveTextContent("Bath");
    expect(
      screen.getByRole("heading", { level: 1, name: "Bath" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bathを追う" })).toBeInTheDocument();
    expect(screen.queryByText("次戦")).not.toBeInTheDocument();
  });

  it("returns team metadata", async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "bath" }) }),
    ).resolves.toMatchObject({
      alternates: {
        canonical: "https://www.trylinerugby.com/teams/bath",
      },
      description: "バースの次戦・直近の試合結果・日程を掲載。日本語レビューも。",
      title: "バース 次戦・日程・結果",
    });
  });

  it("calls notFound for unknown teams", async () => {
    teamMocks.getTeamPageDataBySlug.mockResolvedValueOnce(null);

    await expect(
      TeamPage({ params: Promise.resolve({ slug: "unknown" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(navigationMocks.notFound).toHaveBeenCalledTimes(1);
  });
});
