// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const contentMocks = vi.hoisted(() => ({
  getContentStatusForMatches: vi.fn(),
}));

const trackedLinkMocks = vi.hoisted(() => ({
  calls: [] as Array<{ analytics: { cta_id: string; match_id?: string } }>,
}));

const matchesMock = vi.hoisted(() => ({
  getHeadToHeadPageData: vi.fn(),
  listHeadToHeadPairs: vi.fn(),
  normalizeHeadToHeadSlug: vi.fn((teamSlugA: string, teamSlugB: string) =>
    [teamSlugA, teamSlugB].sort().join("-vs-"),
  ),
  parseHeadToHeadSlug: vi.fn((pair: string) => {
    const parts = pair.split("-vs-");

    if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0] === parts[1]) {
      return null;
    }

    return { teamSlugA: parts[0], teamSlugB: parts[1] };
  }),
}));

const navigationMock = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/db/queries/matches", () => matchesMock);
vi.mock("@/lib/db/queries/match-content", () => contentMocks);
vi.mock("@/components/tracked-link", () => ({
  TrackedLink: ({
    analytics,
    children,
    href,
  }: {
    analytics: { cta_id: string; match_id?: string };
    children: ReactNode;
    href: string;
  }) => {
    trackedLinkMocks.calls.push({ analytics });

    return <a href={href}>{children}</a>;
  },
}));
vi.mock("next/navigation", () => navigationMock);

import HeadToHeadPage, {
  generateMetadata,
  generateStaticParams,
} from "@/app/h2h/[pair]/page";

import type { ReactNode } from "react";

const pageData = {
  canonicalSlug: "leinster-vs-toulouse",
  matches: [
    {
      awayScore: 20,
      awayTeam: {
        name: "Stade Toulousain",
        shortCode: "TLS",
        slug: "toulouse",
      },
      competition: {
        name: "Investec Champions Cup",
        season: "2025",
        slug: "champions-cup-2025",
      },
      homeScore: 27,
      homeTeam: { name: "Leinster", shortCode: "LEI", slug: "leinster" },
      id: "match-1",
      kickoffAt: "2025-05-24T13:45:00.000Z",
      round: null,
      roundName: "Final",
      status: "finished",
      venue: "Cardiff",
    },
  ],
  teamA: { name: "Leinster", shortCode: "LEI", slug: "leinster" },
  teamB: { name: "Stade Toulousain", shortCode: "TLS", slug: "toulouse" },
};

describe("H2H page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T00:00:00.000Z"));
    contentMocks.getContentStatusForMatches.mockResolvedValue({});
    trackedLinkMocks.calls.length = 0;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("generates static params from real stored pairs", async () => {
    matchesMock.listHeadToHeadPairs.mockResolvedValue([
      { slug: "leinster-vs-toulouse" },
    ]);

    await expect(generateStaticParams()).resolves.toEqual([
      { pair: "leinster-vs-toulouse" },
    ]);
  });

  it("renders Tryline-scoped H2H match links", async () => {
    matchesMock.getHeadToHeadPageData.mockResolvedValue(pageData);
    contentMocks.getContentStatusForMatches.mockResolvedValue({
      "match-1": { hasPreview: false, hasRecap: true },
    });

    const element = await HeadToHeadPage({
      params: Promise.resolve({ pair: "leinster-vs-toulouse" }),
    });
    const { container } = render(element);

    expect(
      screen.getByRole("heading", {
        name: "Leinster 対 Stade Toulousain 対戦成績",
      }),
    ).toBeInTheDocument();
    expect(container.textContent).toContain("Leinster 対 Stade Toulousain");
    expect(container.textContent).not.toContain("Leinster vs Stade Toulousain");
    expect(screen.getAllByText(/Tryline 収録分/).length).toBeGreaterThan(0);
    expect(container.querySelector('a[href="/matches/match-1"]')).toBeTruthy();
    expect(container.querySelector('a[href="/teams/leinster"]')).toBeTruthy();
    expect(container.querySelector('a[href="/teams/toulouse"]')).toBeTruthy();
    expect(
      container.textContent?.includes('"@type":"BreadcrumbList"'),
    ).toBe(true);
    expect(container.textContent).not.toContain("勝");
    expect(
      screen.getByRole("link", { name: "最新の対戦のレビューを読む →" }),
    ).toHaveAttribute("href", "/matches/match-1");
    expect(contentMocks.getContentStatusForMatches).toHaveBeenCalledWith([
      "match-1",
    ]);
    expect(trackedLinkMocks.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          analytics: expect.objectContaining({
            cta_id: "h2h_latest_review",
            match_id: "match-1",
          }),
        }),
      ]),
    );
  });

  it("shows the nearest future meeting with a tracked match link", async () => {
    matchesMock.getHeadToHeadPageData.mockResolvedValue({
      ...pageData,
      matches: [
        {
          ...pageData.matches[0],
          id: "next-later-match",
          kickoffAt: "2026-08-15T13:45:00.000Z",
          status: "scheduled",
        },
        {
          ...pageData.matches[0],
          id: "next-match",
          kickoffAt: "2026-08-08T13:45:00.000Z",
          status: "scheduled",
        },
        pageData.matches[0],
      ],
    });
    contentMocks.getContentStatusForMatches.mockResolvedValue({
      "match-1": { hasPreview: false, hasRecap: false },
    });

    const element = await HeadToHeadPage({
      params: Promise.resolve({ pair: "leinster-vs-toulouse" }),
    });
    render(element);

    expect(screen.getByText("次回対戦")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "次回対戦の詳細を見る →" }),
    ).toHaveAttribute("href", "/matches/next-match");
    expect(
      screen.queryByRole("link", { name: "最新の対戦のレビューを読む →" }),
    ).not.toBeInTheDocument();
    expect(trackedLinkMocks.calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          analytics: expect.objectContaining({
            cta_id: "h2h_next_match",
            match_id: "next-match",
          }),
        }),
      ]),
    );
  });

  it("redirects reverse pair slugs to the canonical URL", async () => {
    await expect(
      HeadToHeadPage({
        params: Promise.resolve({ pair: "toulouse-vs-leinster" }),
      }),
    ).rejects.toThrow("NEXT_REDIRECT:/h2h/leinster-vs-toulouse");
  });

  it("notFound when the pair has no stored matches", async () => {
    matchesMock.getHeadToHeadPageData.mockResolvedValue(null);

    await expect(
      HeadToHeadPage({
        params: Promise.resolve({ pair: "bath-vs-leinster" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("returns canonical metadata for the normalized pair", async () => {
    matchesMock.getHeadToHeadPageData.mockResolvedValue(pageData);

    await expect(
      generateMetadata({
        params: Promise.resolve({ pair: "leinster-vs-toulouse" }),
      }),
    ).resolves.toMatchObject({
      alternates: {
        canonical: "https://www.trylinerugby.com/h2h/leinster-vs-toulouse",
      },
      openGraph: {
        locale: "ja_JP",
        title: "Leinster 対 Stade Toulousain 対戦成績 | Tryline",
      },
      title: {
        absolute: "Leinster 対 Stade Toulousain 対戦成績 | Tryline",
      },
    });
  });
});
