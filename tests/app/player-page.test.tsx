// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PlayerPage from "@/app/players/[slug]/page";

const playerMocks = vi.hoisted(() => ({
  getMatchesForPlayer: vi.fn(),
  getPlayerCareerStats: vi.fn(),
  getPlayerBySlug: vi.fn(),
  isIndexablePlayer: vi.fn(),
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

const player = {
  aliasTeams: [],
  canonicalSlug: null,
  hasPublishedContentMatch: true,
  id: "player-1",
  name: "Takuro Matsunaga",
  position: "Fly-half",
  slug: "takuro-matsunaga",
  teamName: "Kobelco Kobe Steelers",
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
    playerMocks.getPlayerCareerStats.mockResolvedValue({
      appearances: 2,
      conversions: 1,
      penaltyGoals: 1,
      points: 10,
      tries: 1,
    });
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
});
