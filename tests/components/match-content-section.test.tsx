// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MatchContentSection } from "@/components/match-content-section";

import type { PublishedMatchContent } from "@/lib/db/queries/match-content";
import type { MatchDetail } from "@/lib/db/queries/matches";

const match: MatchDetail = {
  awayScore: null,
  awayTeam: {
    englishName: "France",
    name: "France",
    shortCode: "FRA",
    slug: "france",
  },
  awayTeamId: "00000000-0000-0000-0000-000000000003",
  competition: {
    family: "six-nations",
    name: "Six Nations 2027",
    season: "2027",
    slug: "six-nations-2027",
  },
  homeScore: null,
  homeTeam: {
    englishName: "Ireland",
    name: "Ireland",
    shortCode: "IRL",
    slug: "ireland",
  },
  homeTeamId: "00000000-0000-0000-0000-000000000002",
  id: "00000000-0000-0000-0000-000000000001",
  kickoffAt: "2027-02-06T15:00:00.000Z",
  round: 1,
  roundName: null,
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
    cleanup();
    vi.useRealTimers();
  });

  it("renders MatchContent when published content exists", () => {
    render(
      <MatchContentSection
        content={content}
        contentType="preview"
        isPremium
        match={match}
      />,
    );

    expect(screen.getByText("本文コンテンツ")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "プレビュー" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Match Preview")).not.toBeInTheDocument();
    expect(
      screen.queryByText("プレビューは試合開始 48 時間前に公開予定"),
    ).not.toBeInTheDocument();
  });

  it("passes showCta to published MatchContent", () => {
    render(
      <MatchContentSection
        content={{
          ...content,
          contentMdJa: "# 概要\n\n無料本文\n\n# 続き\n\nロック本文",
        }}
        contentType="preview"
        isPremium={false}
        match={match}
        showCta={false}
      />,
    );

    expect(
      screen.queryByText("Ireland vs France の勝負どころを最後まで読む"),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Premium を始める - ¥980/月" }),
    ).toBeNull();
  });

  it("passes a match title to the locked MatchContent CTA", () => {
    render(
      <MatchContentSection
        content={{
          ...content,
          contentMdJa: "# 概要\n\n無料本文\n\n# 続き\n\nロック本文",
        }}
        contentType="preview"
        isPremium={false}
        match={match}
      />,
    );

    expect(
      screen.getByText("Ireland vs France の勝負どころを最後まで読む"),
    ).toBeInTheDocument();
  });

  it("uses English team names for English locked content CTA", () => {
    render(
      <MatchContentSection
        content={{
          ...content,
          contentMdJa: "# Overview\n\nFree body\n\n# Analysis\n\nLocked body",
        }}
        contentType="preview"
        isPremium={false}
        language="en"
        match={{
          ...match,
          awayTeam: {
            ...match.awayTeam,
            englishName: "Les Bleus",
          },
          homeTeam: {
            ...match.homeTeam,
            englishName: "Irish Rugby",
          },
        }}
      />,
    );

    expect(
      screen.getByText(
        "Read the full Irish Rugby vs Les Bleus analysis with Premium",
      ),
    ).toBeInTheDocument();
  });

  it("renders ContentPlaceholder when content is null", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-02-03T00:00:00.000Z"));

    render(
      <MatchContentSection
        content={null}
        contentType="preview"
        isPremium={false}
        match={match}
      />,
    );

    expect(
      screen.getByText("プレビューは試合開始 48 時間前に公開予定"),
    ).toBeInTheDocument();
  });
});
