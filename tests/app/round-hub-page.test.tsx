// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const competitionsMock = vi.hoisted(() => ({
  getCompetitionBySlug: vi.fn(),
  listSeasonsByFamily: vi.fn(),
}));

const contentStatusMock = vi.hoisted(() => ({
  getContentStatusForMatches: vi.fn(),
}));

const matchesMock = vi.hoisted(() => ({
  getRoundMatches: vi.fn(),
  listRoundHubParams: vi.fn(),
  listRoundsForCompetition: vi.fn(),
}));

const navigationMock = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/db/queries/competitions", () => competitionsMock);
vi.mock("@/lib/db/queries/match-content", () => contentStatusMock);
vi.mock("@/lib/db/queries/matches", () => matchesMock);
vi.mock("next/navigation", () => navigationMock);

import RoundHubPage, {
  generateMetadata,
  generateStaticParams,
} from "@/app/c/[competition]/[season]/round/[round]/page";

const match = {
  awayScore: 21,
  awayTeam: { name: "France", shortCode: "FRA", slug: "france" },
  homeScore: 24,
  homeTeam: { name: "Ireland", shortCode: "IRE", slug: "ireland" },
  id: "match-1",
  kickoffAt: "2025-02-15T14:15:00.000Z",
  round: 3,
  roundName: null,
  status: "finished",
  venue: "Aviva Stadium",
};

describe("round hub page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates static params from numeric round hubs", async () => {
    matchesMock.listRoundHubParams.mockResolvedValue([
      { competition: "six-nations", round: 3, season: "2025" },
    ]);

    await expect(generateStaticParams()).resolves.toEqual([
      { competition: "six-nations", round: "3", season: "2025" },
    ]);
  });

  it("renders match links in the initial page tree", async () => {
    competitionsMock.getCompetitionBySlug.mockResolvedValue({
      family: "six-nations",
      name: "Six Nations",
      season: "2025",
    });
    competitionsMock.listSeasonsByFamily.mockResolvedValue([
      { season: "2025" },
    ]);
    matchesMock.getRoundMatches.mockResolvedValue([match]);
    matchesMock.listRoundsForCompetition.mockResolvedValue([1, 2, 3, 4, 5]);
    contentStatusMock.getContentStatusForMatches.mockResolvedValue({
      "match-1": { hasPreview: true, hasRecap: true },
    });

    const element = await RoundHubPage({
      params: Promise.resolve({
        competition: "six-nations",
        round: "3",
        season: "2025",
      }),
    });
    const { container } = render(element);

    expect(
      screen.getByRole("heading", {
        name: "第3節",
      }),
    ).toBeInTheDocument();
    expect(container.querySelector('a[href="/matches/match-1"]')).toBeTruthy();
    expect(screen.getByText("シックスネイションズ 2025")).toBeInTheDocument();
    expect(screen.getByText("23:15 JST")).toBeInTheDocument();
    expect(screen.getByText("Ireland")).toBeInTheDocument();
    expect(screen.getByText("France")).toBeInTheDocument();
    expect(screen.getByText("24–21")).toBeInTheDocument();
    expect(screen.getByText("プレビューあり")).toBeInTheDocument();
    expect(screen.getByText("レビューあり")).toBeInTheDocument();
    expect(screen.getByText("解説1本")).toBeInTheDocument();
    expect(container.textContent?.includes('"@type":"BreadcrumbList"')).toBe(
      true,
    );
  });

  it("returns canonical metadata for the path URL", async () => {
    competitionsMock.getCompetitionBySlug.mockResolvedValue({
      family: "six-nations",
      name: "Six Nations",
      season: "2025",
    });
    matchesMock.getRoundMatches.mockResolvedValue([match]);

    await expect(
      generateMetadata({
        params: Promise.resolve({
          competition: "six-nations",
          round: "3",
          season: "2025",
        }),
      }),
    ).resolves.toMatchObject({
      alternates: {
        canonical: "https://www.trylinerugby.com/c/six-nations/2025/round/3",
      },
      openGraph: {
        locale: "ja_JP",
      },
    });
  });

  it("notFound for non-numeric round params", async () => {
    await expect(
      RoundHubPage({
        params: Promise.resolve({
          competition: "six-nations",
          round: "semi-final",
          season: "2025",
        }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("notFound when the requested round has no matches", async () => {
    competitionsMock.getCompetitionBySlug.mockResolvedValue({
      family: "six-nations",
      name: "Six Nations",
      season: "2025",
    });
    matchesMock.getRoundMatches.mockResolvedValue([]);
    matchesMock.listRoundsForCompetition.mockResolvedValue([1, 2, 3]);
    competitionsMock.listSeasonsByFamily.mockResolvedValue([
      { season: "2025" },
    ]);

    await expect(
      RoundHubPage({
        params: Promise.resolve({
          competition: "six-nations",
          round: "4",
          season: "2025",
        }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
