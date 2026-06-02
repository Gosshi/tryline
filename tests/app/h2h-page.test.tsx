// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
vi.mock("next/navigation", () => navigationMock);

import HeadToHeadPage, {
  generateMetadata,
  generateStaticParams,
} from "@/app/h2h/[pair]/page";

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

    const element = await HeadToHeadPage({
      params: Promise.resolve({ pair: "leinster-vs-toulouse" }),
    });
    const { container } = render(element);

    expect(
      screen.getByRole("heading", {
        name: "Leinster vs Stade Toulousain 対戦成績",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Tryline 収録分/).length).toBeGreaterThan(0);
    expect(container.querySelector('a[href="/matches/match-1"]')).toBeTruthy();
    expect(container.querySelector('a[href="/t/leinster"]')).toBeTruthy();
    expect(container.querySelector('a[href="/t/toulouse"]')).toBeTruthy();
    expect(
      container.textContent?.includes('"@type":"BreadcrumbList"'),
    ).toBe(true);
    expect(container.textContent).not.toContain("勝");
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
      },
    });
  });
});
