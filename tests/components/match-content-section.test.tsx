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
  broadcasts: [],
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
  poolName: null,
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
      screen.queryByText("Ireland 対 France の勝負どころを最後まで読む"),
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
      screen.getByText("Ireland 対 France の勝負どころを最後まで読む"),
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

  it("calculates Japanese reading time from rendered Markdown text, not syntax", () => {
    render(
      <MatchContentSection
        content={{
          ...content,
          contentMdJa: `# 見出し\n\n${"あ".repeat(490)}**強調** [表示](https://example.com/${"x".repeat(1_000)})`,
        }}
        contentType="preview"
        isPremium
        match={match}
      />,
    );

    expect(screen.getByText("無料部分で約1分")).toBeInTheDocument();
  });

  it("does not count a Markdown URL toward Japanese reading time", () => {
    render(
      <MatchContentSection
        content={{
          ...content,
          contentMdJa: `${"あ".repeat(497)} [表示](https://example.com/${"x".repeat(1_000)})`,
        }}
        contentType="preview"
        isPremium
        match={match}
      />,
    );

    expect(screen.getByText("無料部分で約1分")).toBeInTheDocument();
  });

  it("labels reading time as the free section when locked content exists", () => {
    render(
      <MatchContentSection
        content={{ ...content, contentMdJa: "あ".repeat(499) }}
        contentType="recap"
        isPremium
        lockedContentMd={"い".repeat(1_000)}
        match={match}
      />,
    );

    expect(screen.getByText("無料部分で約1分")).toBeInTheDocument();
  });

  it("keeps the free-section reading time stable while locked content loads", () => {
    const { rerender } = render(
      <MatchContentSection
        content={{ ...content, contentMdJa: "あ".repeat(499) }}
        contentType="recap"
        isPremium={false}
        lockedContentMd={null}
        lockedLoading
        match={match}
      />,
    );

    expect(screen.getByText("無料部分で約1分")).toBeInTheDocument();

    rerender(
      <MatchContentSection
        content={{ ...content, contentMdJa: "あ".repeat(499) }}
        contentType="recap"
        isPremium={false}
        lockedContentMd={"い".repeat(1_000)}
        lockedLoading={false}
        match={match}
      />,
    );

    expect(screen.getByText("無料部分で約1分")).toBeInTheDocument();
  });

  it("keeps a one-minute minimum for empty and Markdown-only content", () => {
    render(
      <MatchContentSection
        content={{ ...content, contentMdJa: "# **" }}
        contentType="preview"
        isPremium
        match={match}
      />,
    );

    expect(screen.getByText("無料部分で約1分")).toBeInTheDocument();
  });

  it("keeps English word-based reading time after Markdown is parsed", () => {
    render(
      <MatchContentSection
        content={{
          ...content,
          contentMdJa: `# Heading\n\n${Array.from({ length: 220 }, () => "word").join(" ")}`,
        }}
        contentType="preview"
        isPremium
        language="en"
        match={match}
      />,
    );

    expect(
      screen.getByText("About 2 min for the free section"),
    ).toBeInTheDocument();
  });

  it("does not add source or timeline content to reading time", () => {
    render(
      <MatchContentSection
        afterBody={<p>{"after body ".repeat(1_000)}</p>}
        betweenLeadAndBody={<p>{"timeline ".repeat(1_000)}</p>}
        content={{ ...content, contentMdJa: "あ".repeat(499) }}
        contentType="preview"
        isPremium
        match={match}
      />,
    );

    expect(screen.getByText("無料部分で約1分")).toBeInTheDocument();
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
    expect(screen.queryByText(/無料部分で約/)).not.toBeInTheDocument();
  });
});
