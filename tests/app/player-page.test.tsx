// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PlayerPage from "@/app/players/[slug]/page";

const playerMocks = vi.hoisted(() => ({
  getMatchesForPlayer: vi.fn(),
  getPlayerCareerStats: vi.fn(),
  getPlayerBySlug: vi.fn(),
  getPlayersByTeamSlug: vi.fn(),
  isIndexablePlayer: vi.fn(),
}));

const matchMocks = vi.hoisted(() => ({
  getNextMatchesForTeams: vi.fn(),
}));

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: navigationMocks.notFound,
  redirect: navigationMocks.redirect,
}));

vi.mock("@/lib/db/queries/players", () => playerMocks);
vi.mock("@/lib/db/queries/matches", () => matchMocks);

const player = {
  aliasTeams: [],
  canonicalSlug: null,
  hasPublishedContentMatch: true,
  id: "player-1",
  name: "Takuro Matsunaga",
  position: "Fly-half",
  slug: "takuro-matsunaga",
  teamName: "Kobelco Kobe Steelers",
  teamId: "team-1",
  teamSlug: "kobelco-kobe-steelers",
};

describe("PlayerPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    navigationMocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    navigationMocks.redirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
    playerMocks.getPlayerBySlug.mockResolvedValue(player);
    playerMocks.getMatchesForPlayer.mockResolvedValue([]);
    playerMocks.getPlayersByTeamSlug.mockResolvedValue([]);
    playerMocks.getPlayerCareerStats.mockResolvedValue({
      appearances: 2,
      conversions: 1,
      penaltyGoals: 1,
      points: 10,
      tries: 1,
    });
    matchMocks.getNextMatchesForTeams.mockResolvedValue([]);
  });

  it("renders career stats from match events", async () => {
    render(
      await PlayerPage({
        params: Promise.resolve({ slug: "takuro-matsunaga" }),
      }),
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "通算成績" }),
    ).toBeInTheDocument();
    expect(screen.getByText("出場")).toBeInTheDocument();
    expect(screen.getByText("トライ")).toBeInTheDocument();
    expect(screen.getByText("コンバージョン")).toBeInTheDocument();
    expect(screen.getByText("PG")).toBeInTheDocument();
    expect(screen.getByText("獲得ポイント")).toBeInTheDocument();
    expect(screen.getAllByText("1")).toHaveLength(3);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("renders an honest empty state when no stats exist", async () => {
    playerMocks.getPlayerCareerStats.mockResolvedValue({
      appearances: 0,
      conversions: 0,
      penaltyGoals: 0,
      points: 0,
      tries: 0,
    });

    render(
      await PlayerPage({
        params: Promise.resolve({ slug: "takuro-matsunaga" }),
      }),
    );

    expect(screen.getByText("記録なし")).toBeInTheDocument();
  });

  it("renders next team actions and prioritizes teammates in the same position", async () => {
    matchMocks.getNextMatchesForTeams.mockResolvedValue([
      {
        match: {
          awayScore: null,
          awayTeam: {
            name: "Saitama Wild Knights",
            shortCode: "SAI",
            slug: "saitama-wild-knights",
          },
          competition: {
            family: "league-one",
            name: "Japan Rugby League One",
            season: "2026-27",
            slug: "league-one-2026-27",
          },
          homeScore: null,
          homeTeam: {
            name: "Kobelco Kobe Steelers",
            shortCode: "KOB",
            slug: "kobelco-kobe-steelers",
          },
          id: "next-match",
          kickoffAt: "2026-12-12T05:00:00.000Z",
          poolName: null,
          round: null,
          roundName: null,
          status: "scheduled",
          venue: null,
        },
        teamId: "team-1",
      },
    ]);
    playerMocks.getPlayersByTeamSlug.mockResolvedValue([
      { name: "Other Forward", position: "Lock", slug: "other-forward" },
      { name: "Same Position", position: "Fly-half", slug: "same-position" },
      {
        name: "Takuro Matsunaga",
        position: "Fly-half",
        slug: "takuro-matsunaga",
      },
    ]);

    render(
      await PlayerPage({
        params: Promise.resolve({ slug: "takuro-matsunaga" }),
      }),
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "次に見る" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Kobelco Kobe Steelersを見る" }),
    ).toHaveAttribute("href", "/teams/kobelco-kobe-steelers");
    expect(
      screen.getByRole("link", {
        name: "Kobelco Kobe Steelers 対 Saitama Wild Knights",
      }),
    ).toHaveAttribute("href", "/matches/next-match");
    expect(screen.getByRole("link", { name: /Same Position/ })).toHaveAttribute(
      "href",
      "/players/same-position",
    );
    expect(
      screen.queryByRole("link", { name: "Takuro Matsunaga" }),
    ).not.toBeInTheDocument();
    expect(matchMocks.getNextMatchesForTeams).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeMatchId: "",
        teamIds: ["team-1"],
      }),
    );
  });

  it("shows an unscheduled next-match state and hides an empty teammate list", async () => {
    render(
      await PlayerPage({
        params: Promise.resolve({ slug: "takuro-matsunaga" }),
      }),
    );

    expect(screen.getByText("次戦は未定です")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 3, name: "同じチームの選手" }),
    ).not.toBeInTheDocument();
  });
});
