// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CompetitionHubPage from "@/app/c/[competition]/page";
import { metadata as rwc2027Metadata } from "@/app/c/rwc/2027/page";

const competitionMocks = vi.hoisted(() => ({
  listSeasonsByFamily: vi.fn(),
}));

const matchMocks = vi.hoisted(() => ({
  getRecentlyReviewedMatchesForFamily: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: (props: { alt: string }) => <div aria-label={props.alt} />,
}));

vi.mock("@/components/competition-viewing-guide", () => ({
  CompetitionViewingGuide: () => null,
}));

vi.mock("@/components/match-card", () => ({
  MatchCard: () => null,
}));

vi.mock("@/lib/db/queries/competitions", () => ({
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
        viewingGuideJa: null,
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
        viewingGuideJa: null,
      },
    ]);
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

  it("uses Japanese RWC 2027 metadata for schedule and viewing queries", () => {
    expect(rwc2027Metadata.title).toContain("ラグビーワールドカップ2027");
    expect(rwc2027Metadata.title).toContain("日程");
    expect(rwc2027Metadata.title).toContain("出場国");
    expect(rwc2027Metadata.description).toContain("放送");
    expect(rwc2027Metadata.description).toContain("日本語レビュー");
  });
});
