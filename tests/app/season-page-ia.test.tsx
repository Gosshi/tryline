// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SeasonPage, {
  generateMetadata,
} from "@/app/c/[competition]/[season]/page";

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

const broadcastMocks = vi.hoisted(() => ({
  getMatchBroadcastPresenceForMatches: vi.fn(),
  getMatchBroadcastServicesForMatches: vi.fn(),
}));

const matchesMocks = vi.hoisted(() => ({
  getNextMatchForTeamSlug: vi.fn(),
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

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <div aria-label={alt} data-src={src} role="img" />
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
  CompetitionViewingGuide: ({
    broadcastServices = [],
    markdown,
  }: {
    broadcastServices?: Array<{ serviceName: string; url: string }>;
    markdown: string | null;
  }) => (
    <article data-testid="competition-guide">
      {markdown}
      {broadcastServices.map((service) => (
        <a href={service.url} key={service.serviceName}>
          {service.serviceName}
        </a>
      ))}
    </article>
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
vi.mock("@/lib/db/queries/match-broadcasts", () => broadcastMocks);
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
    matchesMocks.getNextMatchForTeamSlug.mockResolvedValue(null);
    broadcastMocks.getMatchBroadcastPresenceForMatches.mockResolvedValue(
      new Set(),
    );
    broadcastMocks.getMatchBroadcastServicesForMatches.mockResolvedValue([]);
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

  it("places the summary and schedule before standings while keeping the guide expanded", async () => {
    const { container } = render(
      await SeasonPage({
        params: Promise.resolve({
          competition: "premiership",
          season: "2025-26",
        }),
      }),
    );

    const standings = container.querySelector("#standings");
    const schedule = container.querySelector("#schedule");
    const matchGroups = screen.getByTestId("season-match-groups");
    const guide = screen.getByTestId("competition-guide");
    const guideFrame = guide.parentElement;

    expect(screen.getByLabelText("シーズン要約")).toHaveTextContent("次戦");
    expect(screen.getByText("試合開始前に通知します")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "iOSアプリで通知を受け取る" }),
    ).toHaveAttribute(
      "href",
      "https://apps.apple.com/jp/app/id6791587357?ct=hub",
    );
    expect(screen.getByRole("link", { name: "日程・結果" })).toHaveAttribute(
      "href",
      "#schedule",
    );
    expect(screen.getByRole("link", { name: "順位" })).toHaveAttribute(
      "href",
      "#standings",
    );
    expect(
      screen.getByRole("link", { name: "順位表をすべて見る →" }),
    ).toHaveAttribute("href", "/c/premiership/2025-26/standings");
    expect(screen.getByRole("link", { name: "大会ガイド" })).toHaveAttribute(
      "href",
      "#guide",
    );
    expect(standings).not.toBeNull();
    expect(schedule).not.toBeNull();
    expect(guide.closest("details")).toBeNull();
    expect(screen.queryByText("大会ガイドを見る")).not.toBeInTheDocument();
    expect(guideFrame).toHaveClass(
      "rounded-[var(--radius-md)]",
      "bg-white",
      "shadow-[var(--shadow-soft)]",
    );
    expect(guide).toHaveTextContent("観戦ガイド全文");
    expect(follows(schedule!, standings!)).toBe(true);
    expect(follows(matchGroups, standings!)).toBe(true);
    expect(follows(standings!, guideFrame!)).toBe(true);
  });

  it("uses the family visual and derives the hero progress without another query", async () => {
    render(
      await SeasonPage({
        params: Promise.resolve({
          competition: "premiership",
          season: "2025-26",
        }),
      }),
    );

    expect(screen.getByRole("img", { name: "Premiership" })).toHaveAttribute(
      "data-src",
      "/visuals/premiership.jpg",
    );
    expect(screen.getByText("進行")).toBeInTheDocument();
    expect(screen.getByText("0節 / 全1節")).toBeInTheDocument();
    expect(matchesMocks.listMatchesForCompetition).toHaveBeenCalledTimes(1);
  });

  it("omits progress when every match has a null round", async () => {
    matchesMocks.listMatchesForCompetition.mockResolvedValue([
      { ...match, round: null },
    ]);

    render(
      await SeasonPage({
        params: Promise.resolve({
          competition: "premiership",
          season: "2025-26",
        }),
      }),
    );

    expect(screen.queryByText("進行")).not.toBeInTheDocument();
  });

  it("links to the competition-specific iCal subscription", async () => {
    render(
      await SeasonPage({
        params: Promise.resolve({
          competition: "premiership",
          season: "2025-26",
        }),
      }),
    );

    expect(
      screen.getByRole("link", { name: "この大会を購読" }),
    ).toHaveAttribute(
      "href",
      "webcal://www.trylinerugby.com/api/calendar/premiership-2025-26.ics",
    );
    expect(screen.getByRole("link", { name: "大会iCal URL" })).toHaveAttribute(
      "href",
      "https://www.trylinerugby.com/api/calendar/premiership-2025-26.ics",
    );
    expect(
      screen.getByRole("link", { name: "今週の全試合を見る →" }),
    ).toHaveAttribute("href", "/calendar");
    expect(
      screen.getByRole("link", { name: "他の大会も含めた今週の試合 →" }),
    ).toHaveAttribute("href", "/calendar");
  });

  it("passes aggregated broadcast services to the competition guide", async () => {
    const greatestRivalryCompetition = {
      ...competition,
      family: "greatest-rivalry",
      name: "Greatest Rivalry 2026",
      nameJa:
        "グレイテスト・ライバルリー・ツアー オールブラックス 南アフリカ遠征",
      season: "2026",
      slug: "greatest-rivalry-2026",
    };
    competitionMocks.getCompetitionBySlug.mockResolvedValue(
      greatestRivalryCompetition,
    );
    competitionMocks.listSeasonsByFamily.mockResolvedValue([
      greatestRivalryCompetition,
    ]);
    broadcastMocks.getMatchBroadcastServicesForMatches.mockResolvedValue([
      {
        displayOrder: 0,
        kind: "tv",
        serviceName: "J SPORTS 3",
        url: "https://example.com/j-sports-3",
      },
    ]);

    render(
      await SeasonPage({
        params: Promise.resolve({
          competition: "greatest-rivalry",
          season: "2026",
        }),
      }),
    );

    expect(screen.getByRole("link", { name: "J SPORTS 3" })).toHaveAttribute(
      "href",
      "https://example.com/j-sports-3",
    );
    expect(
      broadcastMocks.getMatchBroadcastServicesForMatches,
    ).toHaveBeenCalledWith(["match-1"]);
  });

  it("keeps standings and guide in the DOM when no matches are available", async () => {
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
    const schedule = container.querySelector("#schedule");
    const emptyState = screen.getByText("試合データを準備中です");

    expect(standings).not.toBeNull();
    expect(schedule).not.toBeNull();
    expect(standings).toHaveTextContent("Bath");
    expect(follows(schedule!, standings!)).toBe(true);
    expect(follows(emptyState, standings!)).toBe(true);
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

  it("renders the four Lipovitan Challenge Cup fixtures without standings", async () => {
    const lipovitanCompetition = {
      ...competition,
      family: "lipovitan-challenge-cup",
      matchCount: 4,
      name: "Lipovitan-D Challenge Cup 2026",
      nameJa: "リポビタンDチャレンジカップ2026",
      season: "2026",
      slug: "lipovitan-challenge-cup-2026",
    };
    const lipovitanMatches = [
      match,
      { ...match, id: "match-2", kickoffAt: "2026-08-15T05:00:00.000Z" },
      { ...match, id: "match-3", kickoffAt: "2026-09-05T05:50:00.000Z" },
      { ...match, id: "match-4", kickoffAt: "2026-10-24T05:50:00.000Z" },
    ];
    competitionMocks.getCompetitionBySlug.mockResolvedValue(
      lipovitanCompetition,
    );
    competitionMocks.listSeasonsByFamily.mockResolvedValue([
      lipovitanCompetition,
    ]);
    matchesMocks.listMatchesForCompetition.mockResolvedValue(lipovitanMatches);
    contentMocks.getContentStatusForMatches.mockResolvedValue({});
    standingsMocks.getStandingsForCompetition.mockResolvedValue([]);
    standingsMocks.getPoolStandingsForCompetition.mockResolvedValue([]);

    const { container } = render(
      await SeasonPage({
        params: Promise.resolve({
          competition: "lipovitan-challenge-cup",
          season: "2026",
        }),
      }),
    );

    expect(screen.getByText("リポビタンDチャレンジカップ")).toBeInTheDocument();
    expect(screen.getByTestId("season-match-groups")).toBeInTheDocument();
    expect(container.querySelector("#standings")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "順位" }),
    ).not.toBeInTheDocument();
  });

  it("shows a standings excerpt while keeping the full table in collapsed markup", async () => {
    standingsMocks.getStandingsForCompetition.mockResolvedValue([
      { ...standing, position: 1, teamName: "Bath", teamShortCode: "BAT" },
      {
        ...standing,
        position: 2,
        teamName: "Saracens",
        teamShortCode: "SAR",
      },
      {
        ...standing,
        position: 3,
        teamName: "Leicester",
        teamShortCode: "LEI",
      },
      { ...standing, position: 4, teamName: "Exeter", teamShortCode: "EXE" },
      { ...standing, position: 5, teamName: "Japan", teamShortCode: "JPN" },
    ]);
    matchesMocks.listMatchesForCompetition.mockResolvedValue([
      match,
      japanMatch,
    ]);

    render(
      await SeasonPage({
        params: Promise.resolve({
          competition: "pnc",
          season: "2026",
        }),
      }),
    );

    const details = screen.getByText("全順位表を見る").closest("details");

    expect(details).not.toHaveAttribute("open");
    expect(screen.getAllByText("Japan")).toHaveLength(2);
    expect(screen.getByText("Exeter")).toBeInTheDocument();
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

  it("shows the next Japan match in the summary when a scheduled Japan match exists", async () => {
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
    const schedule = container.querySelector("#schedule");
    const japanNextMatch = screen.getByText("日本代表の次戦");
    const link = japanNextMatch.closest("a");

    expect(standings).not.toBeNull();
    expect(schedule).not.toBeNull();
    expect(link).toHaveAttribute("href", "/matches/japan-match-1");
    expect(link).toHaveTextContent("Fiji 対 Japan");
    expect(link).toHaveTextContent("2026-02-28 (土) 18:00 JST");
    expect(follows(link!, schedule!)).toBe(true);
    expect(follows(screen.getByTestId("season-match-groups"), standings!)).toBe(
      true,
    );
  });

  it("adds the newest published recap and chooses an earlier cross-competition Japan match", async () => {
    const olderReview = {
      ...japanMatch,
      id: "older-review",
      kickoffAt: "2026-01-15T09:00:00.000Z",
      status: "finished",
    };
    const latestReview = {
      ...japanMatch,
      id: "latest-review",
      kickoffAt: "2026-01-22T09:00:00.000Z",
      status: "finished",
    };
    matchesMocks.listMatchesForCompetition.mockResolvedValue([
      japanMatch,
      olderReview,
      latestReview,
    ]);
    matchesMocks.getNextMatchForTeamSlug.mockResolvedValue({
      ...japanMatch,
      competition: {
        family: "lipovitan-challenge-cup",
        name: "Lipovitan Challenge Cup",
        season: "2026",
        slug: "lipovitan-challenge-cup-2026",
      },
      id: "japan-australia",
      kickoffAt: "2026-02-10T09:00:00.000Z",
    });
    contentMocks.getContentStatusForMatches.mockResolvedValue({
      [olderReview.id]: { hasPreview: false, hasRecap: true },
      [latestReview.id]: { hasPreview: false, hasRecap: true },
    });

    render(
      await SeasonPage({
        params: Promise.resolve({ competition: "pnc", season: "2026" }),
      }),
    );

    expect(screen.getByText("最新レビュー").closest("a")).toHaveAttribute(
      "href",
      "/matches/latest-review",
    );
    const japanNext = screen.getByText("日本代表の次戦").closest("a");

    expect(japanNext).toHaveAttribute("href", "/matches/japan-australia");
    expect(japanNext).toHaveTextContent("Lipovitan Challenge Cup 2026");
    expect(matchesMocks.getNextMatchForTeamSlug).toHaveBeenCalledWith(
      "japan",
      "2026-02-01T00:00:00.000Z",
    );
    expect(screen.getByLabelText("シーズン要約")).toHaveClass("lg:grid-cols-4");
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

  it("uses the information title when there are no matches or every match is cancelled", async () => {
    matchesMocks.listMatchesForCompetition.mockResolvedValue([]);
    contentMocks.getContentStatusForMatches.mockResolvedValue({});

    await expect(
      generateMetadata({
        params: Promise.resolve({
          competition: "premiership",
          season: "2025-26",
        }),
      }),
    ).resolves.toMatchObject({
      title: "プレミアシップ 2025-26 大会情報・見どころ",
    });

    matchesMocks.listMatchesForCompetition.mockResolvedValue([
      { ...match, status: "cancelled" },
    ]);

    await expect(
      generateMetadata({
        params: Promise.resolve({
          competition: "premiership",
          season: "2025-26",
        }),
      }),
    ).resolves.toMatchObject({
      title: "プレミアシップ 2025-26 大会情報・見どころ",
    });
  });

  it("uses the pre-tournament title based on broadcast availability", async () => {
    broadcastMocks.getMatchBroadcastPresenceForMatches.mockResolvedValue(
      new Set([match.id]),
    );

    await expect(
      generateMetadata({
        params: Promise.resolve({
          competition: "premiership",
          season: "2025-26",
        }),
      }),
    ).resolves.toMatchObject({
      title: "プレミアシップ 2025-26 日程・放送予定・見どころ",
    });

    broadcastMocks.getMatchBroadcastPresenceForMatches.mockResolvedValue(
      new Set(),
    );

    await expect(
      generateMetadata({
        params: Promise.resolve({
          competition: "premiership",
          season: "2025-26",
        }),
      }),
    ).resolves.toMatchObject({
      title: "プレミアシップ 2025-26 日程・見どころ",
    });
  });

  it("treats scheduled and cancelled matches as pre-tournament", async () => {
    matchesMocks.listMatchesForCompetition.mockResolvedValue([
      match,
      { ...match, id: "cancelled-match", status: "cancelled" },
    ]);

    await expect(
      generateMetadata({
        params: Promise.resolve({
          competition: "premiership",
          season: "2025-26",
        }),
      }),
    ).resolves.toMatchObject({
      title: "プレミアシップ 2025-26 日程・見どころ",
    });
  });

  it("includes standings only for an active competition with standings", async () => {
    competitionMocks.getCompetitionBySlug.mockResolvedValue({
      ...competition,
      family: "nations-championship",
      name: "Nations Championship",
      season: "2026",
      slug: "nations-championship-2026",
    });
    matchesMocks.listMatchesForCompetition.mockResolvedValue([
      { ...match, id: "finished-match", status: "finished" },
      match,
    ]);

    await expect(
      generateMetadata({
        params: Promise.resolve({
          competition: "nations-championship",
          season: "2026",
        }),
      }),
    ).resolves.toMatchObject({
      title: "ネーションズチャンピオンシップ 2026 最新結果・次戦・日程・順位",
    });

    standingsMocks.getStandingsForCompetition.mockResolvedValue([]);

    await expect(
      generateMetadata({
        params: Promise.resolve({
          competition: "nations-championship",
          season: "2026",
        }),
      }),
    ).resolves.toMatchObject({
      title: "ネーションズチャンピオンシップ 2026 最新結果・次戦・日程",
    });
  });

  it("does not include standings for the pre-tournament Lipovitan Challenge Cup", async () => {
    competitionMocks.getCompetitionBySlug.mockResolvedValue({
      ...competition,
      family: "lipovitan-challenge-cup",
      name: "Lipovitan-D Challenge Cup",
      nameJa: "リポビタンDチャレンジカップ",
      season: "2026",
      slug: "lipovitan-challenge-cup-2026",
    });
    standingsMocks.getStandingsForCompetition.mockResolvedValue([]);

    await expect(
      generateMetadata({
        params: Promise.resolve({
          competition: "lipovitan-challenge-cup",
          season: "2026",
        }),
      }),
    ).resolves.toMatchObject({
      title: "リポビタンDチャレンジカップ 2026 日程・見どころ",
    });
  });

  it("treats finished and cancelled matches as post-tournament and only includes recaps when present", async () => {
    const finishedMatch = {
      ...match,
      id: "finished-match",
      status: "finished",
    };

    matchesMocks.listMatchesForCompetition.mockResolvedValue([
      finishedMatch,
      { ...match, id: "cancelled-match", status: "cancelled" },
    ]);
    contentMocks.getContentStatusForMatches.mockResolvedValue({
      [finishedMatch.id]: { hasPreview: false, hasRecap: true },
    });

    await expect(
      generateMetadata({
        params: Promise.resolve({
          competition: "premiership",
          season: "2025-26",
        }),
      }),
    ).resolves.toMatchObject({
      title: "プレミアシップ 2025-26 全試合結果・日本語レビュー",
    });

    contentMocks.getContentStatusForMatches.mockResolvedValue({});

    await expect(
      generateMetadata({
        params: Promise.resolve({
          competition: "premiership",
          season: "2025-26",
        }),
      }),
    ).resolves.toMatchObject({ title: "プレミアシップ 2025-26 全試合結果" });
  });

  it("keeps the Six Nations label in the description and propagates broadcast query errors", async () => {
    competitionMocks.getCompetitionBySlug.mockResolvedValue({
      ...competition,
      family: "six-nations",
      name: "Six Nations",
      season: "2026",
      slug: "six-nations-2026",
    });

    await expect(
      generateMetadata({
        params: Promise.resolve({ competition: "six-nations", season: "2026" }),
      }),
    ).resolves.toMatchObject({
      description: expect.stringContaining("6カ国対抗"),
    });

    broadcastMocks.getMatchBroadcastPresenceForMatches.mockRejectedValue(
      new Error("broadcast query failed"),
    );

    await expect(
      generateMetadata({
        params: Promise.resolve({ competition: "six-nations", season: "2026" }),
      }),
    ).rejects.toThrow("broadcast query failed");
  });
});
