// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SeasonPage from "@/app/c/[competition]/[season]/page";

import type { MatchContentStatus } from "@/lib/db/queries/match-content";
import type { MatchListItem } from "@/lib/db/queries/matches";
import type { ReactNode } from "react";

const competitionMocks = vi.hoisted(() => ({
  getCompetitionBySlug: vi.fn(),
  getCompetitionGuide: vi.fn(),
  listFamilies: vi.fn(),
  listSeasonsByFamily: vi.fn(),
}));

const contentMocks = vi.hoisted(() => ({
  getContentStatusForMatches: vi.fn(),
}));

const matchesMocks = vi.hoisted(() => ({
  listMatchesForCompetition: vi.fn(),
}));

const standingsMocks = vi.hoisted(() => ({
  getPoolStandingsForCompetition: vi.fn(),
  getStandingsForCompetition: vi.fn(),
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
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

vi.mock("@/components/competition-viewing-guide", () => ({
  CompetitionViewingGuide: ({ markdown }: { markdown: string | null }) => (
    <article data-testid="competition-guide">{markdown}</article>
  ),
}));

vi.mock("@/components/premium-upsell-banner", () => ({
  PremiumUpsellBanner: () => <section data-testid="premium-upsell" />,
}));

vi.mock("@/components/season-match-groups", () => ({
  SeasonMatchGroups: () => <section data-testid="season-match-groups" />,
}));

vi.mock("@/components/season-switcher", () => ({
  SeasonSwitcher: () => <nav data-testid="season-switcher" />,
}));

vi.mock("@/lib/db/queries/competitions", () => competitionMocks);
vi.mock("@/lib/db/queries/match-content", () => contentMocks);
vi.mock("@/lib/db/queries/matches", () => matchesMocks);
vi.mock("@/lib/db/queries/standings", () => standingsMocks);

const competition = {
  champion: null,
  endDate: "2026-05-30",
  family: "premiership",
  id: "premiership-2025-26",
  matchCount: 1,
  name: "Premiership Rugby",
  nameJa: null,
  publishedContentCount: 1,
  season: "2025-26",
  slug: "premiership-2025-26",
  startDate: "2025-09-20",
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
  teamName: "Bath",
  teamShortCode: "BAT",
  totalPoints: 13,
  triesFor: 10,
  won: 2,
};

const match: MatchListItem = {
  awayScore: null,
  awayTeam: {
    name: "Saracens",
    shortCode: "SAR",
    slug: "saracens",
  },
  homeScore: null,
  homeTeam: {
    name: "Bath",
    shortCode: "BAT",
    slug: "bath",
  },
  id: "match-1",
  kickoffAt: "2026-03-01T12:00:00.000Z",
  poolName: null,
  round: 1,
  roundName: null,
  status: "scheduled",
  venue: "The Rec",
};

const japanMatch: MatchListItem = {
  ...match,
  awayTeam: {
    name: "Japan",
    shortCode: "JPN",
    slug: "japan",
  },
  homeTeam: {
    name: "Fiji",
    shortCode: "FIJ",
    slug: "fiji",
  },
  id: "japan-match-1",
  kickoffAt: "2026-02-28T09:00:00.000Z",
};

function follows(left: Element, right: Element): boolean {
  return Boolean(
    left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

function getJsonLdScripts(container: HTMLElement): Record<string, unknown>[] {
  return Array.from(
    container.querySelectorAll<HTMLScriptElement>(
      'script[type="application/ld+json"]',
    ),
  ).map((script) => JSON.parse(script.textContent ?? "{}"));
}

function getFaqJsonLd(container: HTMLElement) {
  return getJsonLdScripts(container).find(
    (script) => script["@type"] === "FAQPage",
  ) as
    | {
        mainEntity: Array<{
          acceptedAnswer: { text: string };
          name: string;
        }>;
      }
    | undefined;
}

describe("season page information architecture", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
    vi.clearAllMocks();
    competitionMocks.getCompetitionBySlug.mockResolvedValue(competition);
    competitionMocks.getCompetitionGuide.mockResolvedValue({
      guideJa: "観戦ガイド全文",
      sourceUrl: null,
      verifiedAt: null,
    });
    competitionMocks.listSeasonsByFamily.mockResolvedValue([competition]);
    matchesMocks.listMatchesForCompetition.mockResolvedValue([match]);
    standingsMocks.getPoolStandingsForCompetition.mockResolvedValue([]);
    standingsMocks.getStandingsForCompetition.mockResolvedValue([standing]);
    contentMocks.getContentStatusForMatches.mockResolvedValue({
      [match.id]: {
        hasPreview: true,
        hasRecap: false,
      } satisfies MatchContentStatus,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("places standings before the match list and keeps the guide expanded at the bottom", async () => {
    const { container } = render(
      await SeasonPage({
        params: Promise.resolve({
          competition: "premiership",
          season: "2025-26",
        }),
      }),
    );

    const standings = container.querySelector("#standings");
    const matchGroups = screen.getByTestId("season-match-groups");
    const guide = screen.getByTestId("competition-guide");
    const guideFrame = guide.parentElement;

    expect(standings).not.toBeNull();
    expect(guide.closest("details")).toBeNull();
    expect(screen.queryByText("大会ガイドを見る")).not.toBeInTheDocument();
    expect(guideFrame).toHaveClass(
      "rounded-[var(--radius-md)]",
      "bg-white",
      "shadow-[var(--shadow-soft)]",
    );
    expect(guide).toHaveTextContent("観戦ガイド全文");
    expect(follows(standings!, matchGroups)).toBe(true);
    expect(follows(matchGroups, guideFrame!)).toBe(true);
  });

  it("keeps standings above the empty state when no matches are available", async () => {
    matchesMocks.listMatchesForCompetition.mockResolvedValue([]);
    contentMocks.getContentStatusForMatches.mockResolvedValue({});

    const { container } = render(
      await SeasonPage({
        params: Promise.resolve({
          competition: "premiership",
          season: "2025-26",
        }),
      }),
    );

    const standings = container.querySelector("#standings");
    const emptyState = screen.getByText("試合データを準備中です");

    expect(standings).not.toBeNull();
    expect(standings).toHaveTextContent("Bath");
    expect(follows(standings!, emptyState)).toBe(true);
    expect(screen.queryByTestId("season-match-groups")).not.toBeInTheDocument();
  });

  it("renders pool standings when the season has pool assignments", async () => {
    standingsMocks.getPoolStandingsForCompetition.mockResolvedValue([
      {
        poolName: "Northern Hemisphere",
        standings: [standing],
      },
      {
        poolName: "Southern Hemisphere",
        standings: [
          {
            ...standing,
            position: 1,
            teamName: "New Zealand",
            teamShortCode: "NZL",
          },
        ],
      },
    ]);

    render(
      await SeasonPage({
        params: Promise.resolve({
          competition: "nations-championship",
          season: "2026",
        }),
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Northern Hemisphere" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Southern Hemisphere" }),
    ).toBeInTheDocument();
  });

  it("outputs season FAQ JSON-LD without changing breadcrumb JSON-LD", async () => {
    const { container } = render(
      await SeasonPage({
        params: Promise.resolve({
          competition: "premiership",
          season: "2025-26",
        }),
      }),
    );

    const scripts = getJsonLdScripts(container);
    const breadcrumb = scripts.find(
      (script) => script["@type"] === "BreadcrumbList",
    ) as { itemListElement: Array<{ name: string; position: number }> };
    const faq = getFaqJsonLd(container);

    expect(breadcrumb.itemListElement).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Tryline", position: 1 }),
        expect.objectContaining({ name: "Premiership", position: 2 }),
        expect.objectContaining({
          name: "プレミアシップ 2025-26",
          position: 3,
        }),
      ]),
    );
    expect(faq).toBeDefined();
    expect(faq?.mainEntity).toHaveLength(4);
    expect(faq?.mainEntity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          acceptedAnswer: expect.objectContaining({
            text: "次の試合は2026-03-01 (日) 21:00 JST（日本時間）です。",
          }),
          name: "Premiershipの次の試合はいつですか（日本時間）？",
        }),
      ]),
    );
  });

  it("shows the next Japan match block after standings when a scheduled Japan match exists", async () => {
    matchesMocks.listMatchesForCompetition.mockResolvedValue([
      match,
      japanMatch,
    ]);
    contentMocks.getContentStatusForMatches.mockResolvedValue({
      [match.id]: {
        hasPreview: true,
        hasRecap: false,
      } satisfies MatchContentStatus,
      [japanMatch.id]: {
        hasPreview: false,
        hasRecap: false,
      } satisfies MatchContentStatus,
    });

    const { container } = render(
      await SeasonPage({
        params: Promise.resolve({
          competition: "pnc",
          season: "2026",
        }),
      }),
    );

    const standings = container.querySelector("#standings");
    const japanNextMatch = screen.getByText("日本代表の次戦");
    const link = japanNextMatch.closest("a");

    expect(standings).not.toBeNull();
    expect(link).toHaveAttribute("href", "/matches/japan-match-1");
    expect(link).toHaveTextContent("Fiji 対 Japan");
    expect(link).toHaveTextContent("2026-02-28 (土) 18:00 JST");
    expect(follows(standings!, link!)).toBe(true);
    expect(follows(link!, screen.getByTestId("season-match-groups"))).toBe(
      true,
    );
  });

  it("does not render the Japan match block when no scheduled Japan match exists", async () => {
    render(
      await SeasonPage({
        params: Promise.resolve({
          competition: "six-nations",
          season: "2026",
        }),
      }),
    );

    expect(screen.queryByText("日本代表の次戦")).not.toBeInTheDocument();
  });

  it("keeps FAQ JSON-LD when the season has no matches", async () => {
    matchesMocks.listMatchesForCompetition.mockResolvedValue([]);
    contentMocks.getContentStatusForMatches.mockResolvedValue({});

    const { container } = render(
      await SeasonPage({
        params: Promise.resolve({
          competition: "pnc",
          season: "2027",
        }),
      }),
    );

    const faq = getFaqJsonLd(container);

    expect(screen.queryByText("日本代表の次戦")).not.toBeInTheDocument();
    expect(faq).toBeDefined();
    expect(faq?.mainEntity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          acceptedAnswer: expect.objectContaining({
            text: "現在予定されている試合はありません。",
          }),
        }),
      ]),
    );
  });
});
