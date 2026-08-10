// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CompetitionStandingsPage, {
  generateMetadata,
  generateStaticParams,
} from "@/app/c/[competition]/[season]/standings/page";

import type { ReactNode } from "react";

const competitionMocks = vi.hoisted(() => ({
  getCompetitionBySlug: vi.fn(),
}));

const standingsMocks = vi.hoisted(() => ({
  getPoolStandingsForCompetition: vi.fn(),
  getStandingsForCompetition: vi.fn(),
  getStandingsUpdatedAtForCompetition: vi.fn(),
  listStandingsPageParams: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
}));

vi.mock("@/lib/db/queries/competitions", () => competitionMocks);
vi.mock("@/lib/db/queries/standings", () => standingsMocks);

const competition = {
  champion: null,
  endDate: "2026-03-14",
  family: "six-nations",
  id: "six-nations-2026",
  matchCount: 15,
  name: "Six Nations",
  nameJa: null,
  publishedContentCount: 0,
  season: "2026",
  slug: "six-nations-2026",
  startDate: "2026-02-05",
};

const standing = {
  bonusPointsLosing: 0,
  bonusPointsTry: 1,
  drawn: 0,
  lost: 1,
  played: 3,
  pointsAgainst: 54,
  pointsFor: 82,
  position: 1,
  teamName: "イングランド",
  teamShortCode: "ENG",
  totalPoints: 13,
  triesFor: 10,
  won: 2,
};

const params = Promise.resolve({ competition: "six-nations", season: "2026" });

describe("competition standings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    competitionMocks.getCompetitionBySlug.mockResolvedValue(competition);
    standingsMocks.getPoolStandingsForCompetition.mockResolvedValue([]);
    standingsMocks.getStandingsForCompetition.mockResolvedValue([standing]);
    standingsMocks.getStandingsUpdatedAtForCompetition.mockResolvedValue(
      "2026-02-10T03:04:00.000Z",
    );
    standingsMocks.listStandingsPageParams.mockResolvedValue([
      {
        competition: "six-nations",
        season: "2026",
        updatedAt: "2026-02-10T03:04:00.000Z",
      },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the existing standings table with Japanese competition metadata", async () => {
    render(await CompetitionStandingsPage({ params }));

    expect(
      screen.getByRole("heading", { name: "シックスネイションズ 2026 順位表" }),
    ).toBeInTheDocument();
    expect(screen.getByText("イングランド")).toBeInTheDocument();
    expect(screen.getByText(/最終更新:/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "大会ハブへ戻る" }),
    ).toHaveAttribute("href", "/c/six-nations/2026");
    expect(
      screen.getByRole("link", { name: "日程・結果を見る" }),
    ).toHaveAttribute("href", "/c/six-nations/2026#schedule");
    expect(
      screen.getByRole("link", { name: "今週の全試合を見る →" }),
    ).toHaveAttribute("href", "/calendar");
  });

  it("returns 404 instead of rendering a thin page without standings", async () => {
    standingsMocks.getStandingsForCompetition.mockResolvedValue([]);

    await expect(CompetitionStandingsPage({ params })).rejects.toThrow(
      "notFound",
    );
  });

  it("uses only seasons with standings as static params", async () => {
    await expect(generateStaticParams()).resolves.toEqual([
      { competition: "six-nations", season: "2026" },
    ]);
  });

  it("uses standings-focused Japanese metadata", async () => {
    await expect(generateMetadata({ params })).resolves.toMatchObject({
      alternates: {
        canonical: "https://www.trylinerugby.com/c/six-nations/2026/standings",
      },
      description:
        "シックスネイションズ 2026の最新順位表。勝点・勝敗・得失点を確認できます。",
      title: {
        absolute: "シックスネイションズ 2026 順位表 | Tryline",
      },
    });
  });
});
