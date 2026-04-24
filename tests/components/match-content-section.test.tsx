// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MatchContentSection } from "@/components/match-content-section";

import type { PublishedMatchContent } from "@/lib/db/queries/match-content";
import type { MatchDetail } from "@/lib/db/queries/matches";

const match: MatchDetail = {
  awayScore: null,
  awayTeam: {
    name: "France",
    shortCode: "FRA",
    slug: "france",
  },
  competition: {
    name: "Six Nations 2027",
    season: "2027",
    slug: "six-nations-2027",
  },
  homeScore: null,
  homeTeam: {
    name: "Ireland",
    shortCode: "IRL",
    slug: "ireland",
  },
  id: "00000000-0000-0000-0000-000000000001",
  kickoffAt: "2027-02-06T15:00:00.000Z",
  round: 1,
  status: "scheduled",
  venue: "Aviva Stadium",
};

const content: PublishedMatchContent = {
  contentMdJa: "本文コンテンツ",
  contentType: "preview",
  generatedAt: "2027-02-04T14:12:00.000Z",
  modelVersion: "gpt-4o-2024-11-20",
  promptVersion: "preview@1.0.0",
};

describe("MatchContentSection", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders MatchContent when published content exists", () => {
    render(
      <MatchContentSection
        content={content}
        contentType="preview"
        match={match}
      />,
    );

    expect(screen.getByText("本文コンテンツ")).toBeInTheDocument();
    expect(
      screen.queryByText("プレビューは試合開始 48 時間前に公開予定"),
    ).not.toBeInTheDocument();
  });

  it("renders ContentPlaceholder when content is null", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-02-03T00:00:00.000Z"));

    render(
      <MatchContentSection
        content={null}
        contentType="preview"
        match={match}
      />,
    );

    expect(
      screen.getByText("プレビューは試合開始 48 時間前に公開予定"),
    ).toBeInTheDocument();
  });
});
