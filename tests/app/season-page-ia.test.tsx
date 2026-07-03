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

function follows(left: Element, right: Element): boolean {
  return Boolean(
    left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

describe("season page information architecture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    competitionMocks.getCompetitionBySlug.mockResolvedValue(competition);
    competitionMocks.getCompetitionGuide.mockResolvedValue("観戦ガイド全文");
    competitionMocks.listSeasonsByFamily.mockResolvedValue([competition]);
    matchesMocks.listMatchesForCompetition.mockResolvedValue([match]);
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
  });

  it("places standings before the match list and keeps the guide collapsed at the bottom", async () => {
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
    const details = guide.closest("details");

    expect(standings).not.toBeNull();
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("大会ガイドを見る")).toBeInTheDocument();
    expect(guide).toHaveTextContent("観戦ガイド全文");
    expect(follows(standings!, matchGroups)).toBe(true);
    expect(follows(matchGroups, details!)).toBe(true);
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
});
