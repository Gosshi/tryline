// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TeamPage, { generateMetadata } from "@/app/teams/[slug]/page";

const teamMocks = vi.hoisted(() => ({
  getTeamPageDataBySlug: vi.fn(),
}));

const contentMocks = vi.hoisted(() => ({
  getContentStatusMap: vi.fn(),
}));

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: navigationMocks.notFound,
}));

vi.mock("@/lib/db/queries/teams", () => ({
  getTeamPageDataBySlug: teamMocks.getTeamPageDataBySlug,
}));

vi.mock("@/lib/db/queries/match-content", () => ({
  getContentStatusMap: contentMocks.getContentStatusMap,
}));

describe("TeamPage", () => {
  beforeEach(() => {
    navigationMocks.notFound.mockReset();
    navigationMocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    teamMocks.getTeamPageDataBySlug.mockReset();
    contentMocks.getContentStatusMap.mockReset();
    contentMocks.getContentStatusMap.mockResolvedValue(new Map());
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
        shortCode: "BAT",
        slug: "bath",
      },
      upcomingMatches: [
        {
          awayScore: null,
          awayTeam: { name: "Sale Sharks", shortCode: "SAL", slug: "sale-sharks" },
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

  it("renders the team page with breadcrumbs and match sections", async () => {
    render(await TeamPage({ params: Promise.resolve({ slug: "bath" }) }));

    expect(screen.getByRole("link", { name: "Tryline" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Bath" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ENG")).toBeInTheDocument();
    expect(screen.getByText("直近の試合")).toBeInTheDocument();
    expect(screen.getByText("次戦")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Bath/ }).length).toBeGreaterThan(0);
  });

  it("returns team metadata", async () => {
    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "bath" }) }),
    ).resolves.toMatchObject({
      description: "Bathの最近の試合と次戦の日程",
      title: "Bath",
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
