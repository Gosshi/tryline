// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CompetitionHubPage from "@/app/c/[competition]/page";
import { metadata as rwc2027Metadata } from "@/app/c/rwc/2027/page";

const competitionMocks = vi.hoisted(() => ({
  getCompetitionGuide: vi.fn(),
  listSeasonsByFamily: vi.fn(),
}));

const matchMocks = vi.hoisted(() => ({
  getRecentlyReviewedMatchesForFamily: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: (props: { alt: string; src: string }) => (
    <div aria-label={props.alt} data-src={props.src} role="img" />
  ),
}));

vi.mock("@/components/competition-viewing-guide", () => ({
  CompetitionViewingGuide: () => null,
}));

vi.mock("@/components/match-card", () => ({
  MatchCard: () => null,
}));

vi.mock("@/lib/db/queries/competitions", () => ({
  getCompetitionGuide: competitionMocks.getCompetitionGuide,
  listSeasonsByFamily: competitionMocks.listSeasonsByFamily,
}));

vi.mock("@/lib/db/queries/matches", () => ({
  getRecentlyReviewedMatchesForFamily:
    matchMocks.getRecentlyReviewedMatchesForFamily,
}));

describe("competition hub indexing", () => {
  beforeEach(() => {
    competitionMocks.listSeasonsByFamily.mockResolvedValue([
      {
        champion: null,
        endDate: "2027-11-13",
        family: "rwc",
        id: "rwc-2027",
        matchCount: 52,
        name: "Rugby World Cup 2027",
        nameJa: "ラグビーワールドカップ2027",
        publishedContentCount: 0,
        season: "2027",
        slug: "rwc-2027",
        startDate: "2027-10-01",
      },
      {
        champion: "South Africa",
        endDate: "2023-10-28",
        family: "rwc",
        id: "rwc-2023",
        matchCount: 48,
        name: "Rugby World Cup 2023",
        nameJa: "ラグビーワールドカップ2023",
        publishedContentCount: 48,
        season: "2023",
        slug: "rwc-2023",
        startDate: "2023-09-08",
      },
    ]);
    competitionMocks.getCompetitionGuide.mockResolvedValue(null);
    matchMocks.getRecentlyReviewedMatchesForFamily.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("links the bare hub to the newest season with matches", async () => {
    render(
      await CompetitionHubPage({
        params: Promise.resolve({ competition: "rwc" }),
      }),
    );

    expect(
      screen.getByRole("link", {
        name: /最新シーズン ラグビーワールドカップ2027/,
      }),
    ).toHaveAttribute("href", "/c/rwc/2027");
  });

  it("uses local key visuals when an image is available", async () => {
    competitionMocks.listSeasonsByFamily.mockResolvedValue([
      {
        champion: null,
        endDate: "2026-06-20",
        family: "premiership",
        id: "premiership-2025-26",
        matchCount: 93,
        name: "Premiership Rugby 2025-26",
        nameJa: "プレミアシップ 2025-26",
        publishedContentCount: 10,
        season: "2025-26",
        slug: "premiership-2025-26",
        startDate: "2025-09-26",
      },
    ]);

    render(
      await CompetitionHubPage({
        params: Promise.resolve({ competition: "premiership" }),
      }),
    );

    expect(screen.getByRole("img", { name: "Premiership" })).toHaveAttribute(
      "data-src",
      "/visuals/premiership.jpg",
    );
  });

  it("uses batch two local key visuals when available", async () => {
    competitionMocks.listSeasonsByFamily.mockResolvedValue([
      {
        champion: null,
        endDate: "2026-06-20",
        family: "urc",
        id: "urc-2025-26",
        matchCount: 151,
        name: "United Rugby Championship 2025-26",
        nameJa: "URC 2025-26",
        publishedContentCount: 10,
        season: "2025-26",
        slug: "urc-2025-26",
        startDate: "2025-09-26",
      },
    ]);

    render(
      await CompetitionHubPage({
        params: Promise.resolve({ competition: "urc" }),
      }),
    );

    expect(screen.getByRole("img", { name: "URC" })).toHaveAttribute(
      "data-src",
      "/visuals/urc.jpg",
    );
  });

  it("falls back to the default key visual when no image is available", async () => {
    competitionMocks.listSeasonsByFamily.mockResolvedValue([
      {
        champion: null,
        endDate: "2027-12-01",
        family: "nations-championship",
        id: "nations-championship-2026",
        matchCount: 36,
        name: "Nations Championship 2026",
        nameJa: "ネーションズチャンピオンシップ2026",
        publishedContentCount: 0,
        season: "2026",
        slug: "nations-championship-2026",
        startDate: "2026-07-01",
      },
    ]);

    render(
      await CompetitionHubPage({
        params: Promise.resolve({ competition: "nations-championship" }),
      }),
    );

    expect(
      screen.getByRole("img", { name: "Nations Championship" }),
    ).toHaveAttribute("data-src", "/visuals/default.jpg");
  });

  it("uses Japanese RWC 2027 metadata for schedule and viewing queries", () => {
    expect(rwc2027Metadata.title).toContain("ラグビーワールドカップ2027");
    expect(rwc2027Metadata.title).toContain("日程");
    expect(rwc2027Metadata.title).toContain("出場国");
    expect(rwc2027Metadata.description).toContain("放送");
    expect(rwc2027Metadata.description).toContain("日本語レビュー");
  });
});
