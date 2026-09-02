// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CalendarMatch } from "@/lib/db/queries/matches";

const matchQueryMock = vi.hoisted(() => ({
  getMatchesInRange: vi.fn(),
}));
const standingsQueryMock = vi.hoisted(() => ({
  getStandingPositionLookupForCompetitions: vi.fn(),
}));
const competitionQueryMock = vi.hoisted(() => ({
  listCompetitionScheduleCoverage: vi.fn(),
}));
const authMock = vi.hoisted(() => ({
  getUser: vi.fn(),
}));
const spoilerGuardMock = vi.hoisted(() => ({
  getSpoilerGuardEnabledForUser: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => authMock);
vi.mock("@/lib/db/queries/competitions", () => competitionQueryMock);
vi.mock("@/lib/db/queries/matches", () => matchQueryMock);
vi.mock("@/lib/db/queries/spoiler-guard", () => spoilerGuardMock);
vi.mock("@/lib/db/queries/standings", () => standingsQueryMock);
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function createCalendarMatch(
  overrides: Partial<CalendarMatch> = {},
): CalendarMatch {
  return {
    awayScore: null,
    awayTeam: {
      id: "away-id",
      name: "France",
      nameJa: "フランス",
      shortCode: "FRA",
      slug: "france",
      worldRanking: 4,
    },
    competition: {
      family: "nations-championship",
      id: "competition-id",
      name: "Nations Championship",
      nameJa: null,
      season: "2026",
      slug: "nations-championship-2026",
    },
    hasBroadcasts: false,
    hasPreview: true,
    hasRecap: false,
    homeScore: null,
    homeTeam: {
      id: "home-id",
      name: "Japan",
      nameJa: "日本",
      shortCode: "JPN",
      slug: "japan",
      worldRanking: 12,
    },
    id: "match-1",
    kickoffAt: "2026-07-18T10:00:00.000Z",
    poolName: null,
    round: 1,
    roundName: "Round 1",
    status: "scheduled",
    venue: "National Stadium",
    ...overrides,
  };
}

describe("/calendar page", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T03:00:00.000Z"));
    matchQueryMock.getMatchesInRange.mockResolvedValue([]);
    authMock.getUser.mockResolvedValue(null);
    spoilerGuardMock.getSpoilerGuardEnabledForUser.mockResolvedValue(false);
    standingsQueryMock.getStandingPositionLookupForCompetitions.mockResolvedValue(
      new Map(),
    );
    competitionQueryMock.listCompetitionScheduleCoverage.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("has canonical metadata and noindex for week query pages", async () => {
    const { generateMetadata } = await import("@/app/calendar/page");

    await expect(generateMetadata({})).resolves.toMatchObject({
      alternates: { canonical: "https://www.trylinerugby.com/calendar" },
      openGraph: {
        images: [
          {
            height: 630,
            url: "/api/og?type=calendar&week_label=7%E6%9C%886%E6%97%A5+-+12%E6%97%A5+JST&match_count=0&competition_count=0",
            width: 1200,
          },
        ],
      },
      title: "今週の試合カレンダー｜海外ラグビー 日本時間",
    });
    await expect(
      generateMetadata({
        searchParams: Promise.resolve({ week: "2026-07-13" }),
      }),
    ).resolves.toMatchObject({
      alternates: { canonical: "https://www.trylinerugby.com/calendar" },
      openGraph: {
        images: [
          {
            url: "/api/og?type=calendar&week_label=7%E6%9C%8813%E6%97%A5+-+19%E6%97%A5+JST&match_count=0&competition_count=0",
          },
        ],
      },
      robots: { follow: true, index: false },
    });
  });

  it("adds match and competition counts plus focus match to calendar metadata", async () => {
    matchQueryMock.getMatchesInRange.mockResolvedValueOnce([
      createCalendarMatch(),
      createCalendarMatch({
        competition: {
          family: "six-nations",
          id: "six-nations-id",
          name: "Six Nations",
          nameJa: null,
          season: "2027",
          slug: "six-nations-2027",
        },
        homeTeam: {
          id: "ireland-id",
          name: "Ireland",
          nameJa: "アイルランド",
          shortCode: "IRE",
          slug: "ireland",
          worldRanking: 2,
        },
        id: "match-2",
      }),
    ]);
    const { generateMetadata } = await import("@/app/calendar/page");

    await expect(
      generateMetadata({
        searchParams: Promise.resolve({ week: "2026-07-13" }),
      }),
    ).resolves.toMatchObject({
      openGraph: {
        images: [
          {
            url: "/api/og?type=calendar&week_label=7%E6%9C%8813%E6%97%A5+-+19%E6%97%A5+JST&match_count=2&competition_count=2&focus_home=Japan&focus_away=France&focus_competition=%E3%83%8D%E3%83%BC%E3%82%B7%E3%83%A7%E3%83%B3%E3%82%BA%E3%83%81%E3%83%A3%E3%83%B3%E3%83%94%E3%82%AA%E3%83%B3%E3%82%B7%E3%83%83%E3%83%97+2026&focus_kickoff=2026-07-18T10%3A00%3A00.000Z",
          },
        ],
      },
    });
    expect(
      standingsQueryMock.getStandingPositionLookupForCompetitions,
    ).toHaveBeenCalledWith(["competition-id", "six-nations-id"]);
  });

  it("renders the current weekly schedule empty state", async () => {
    const { default: CalendarPage } = await import("@/app/calendar/page");

    render(await CalendarPage({}));

    expect(
      screen.getByRole("heading", { name: "今週の試合カレンダー" }),
    ).toBeInTheDocument();
    expect(screen.getByText("7月6日 - 12日 JST")).toBeInTheDocument();
    expect(matchQueryMock.getMatchesInRange).toHaveBeenCalledWith(
      "2026-07-05T15:00:00.000Z",
      "2026-07-12T15:00:00.000Z",
    );
    expect(screen.getByRole("link", { name: "前週" })).toHaveAttribute(
      "href",
      "/calendar?week=2026-06-29",
    );
    expect(screen.getByRole("link", { name: "今週" })).toHaveAttribute(
      "href",
      "/calendar",
    );
    expect(screen.getByRole("link", { name: "全大会を購読" })).toHaveAttribute(
      "href",
      "webcal://www.trylinerugby.com/api/calendar/all.ics",
    );
    expect(screen.getByRole("link", { name: "iCal URL" })).toHaveAttribute(
      "href",
      "https://www.trylinerugby.com/api/calendar/all.ics",
    );
    expect(screen.getByText("週次ニュースレター")).toBeInTheDocument();
    expect(screen.getByText("試合開始前に通知します")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "iOSアプリで通知を受け取る" }),
    ).toHaveAttribute(
      "href",
      "https://apps.apple.com/jp/app/id6791587357?ct=calendar",
    );
    expect(
      screen.getByRole("button", { name: "無料で受け取る" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("大会別に見る")).not.toBeInTheDocument();
    expect(
      screen.getByText(/この週に表示できる試合はありません/),
    ).toBeInTheDocument();
  });

  it("places the calendar description and CTAs after the weekly schedule", async () => {
    const { default: CalendarPage } = await import("@/app/calendar/page");

    render(await CalendarPage({}));

    const schedule = screen.getByText(/この週に表示できる試合はありません/);
    const description = screen.getByText(/月曜 00:00 JST から翌月曜/);
    const calendarSubscription = screen.getByText("カレンダー購読");

    expect(
      schedule.compareDocumentPosition(description) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      schedule.compareDocumentPosition(calendarSubscription) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("uses a valid monday week query", async () => {
    const { default: CalendarPage } = await import("@/app/calendar/page");

    render(
      await CalendarPage({
        searchParams: Promise.resolve({ week: "2026-07-13" }),
      }),
    );

    expect(screen.getByText("7月13日 - 19日 JST")).toBeInTheDocument();
    expect(matchQueryMock.getMatchesInRange).toHaveBeenCalledWith(
      "2026-07-12T15:00:00.000Z",
      "2026-07-19T15:00:00.000Z",
    );
  });

  it("lists only the competitions that have matches in the selected week", async () => {
    matchQueryMock.getMatchesInRange.mockResolvedValue([
      createCalendarMatch(),
      createCalendarMatch({ id: "match-duplicate" }),
      createCalendarMatch({
        competition: {
          family: "six-nations",
          id: "six-nations-id",
          name: "Six Nations",
          nameJa: null,
          season: "2027",
          slug: "six-nations-2027",
        },
        id: "match-2",
      }),
    ]);
    const { default: CalendarPage } = await import("@/app/calendar/page");

    render(await CalendarPage({}));

    const competitionList = screen.getByText("大会別に見る").parentElement;

    expect(competitionList).toBeInTheDocument();
    expect(
      within(competitionList!).getAllByRole("link", {
        name: "ネーションズチャンピオンシップ 2026",
      }),
    ).toHaveLength(1);
    expect(
      within(competitionList!).getByRole("link", {
        name: "シックスネイションズ 2027",
      }),
    ).toHaveAttribute("href", "/c/six-nations/2027");
  });

  it("shows an incomplete competition only when it has no fixture in the selected week", async () => {
    competitionQueryMock.listCompetitionScheduleCoverage.mockResolvedValue([
      {
        family: "top-14",
        ingestedRoundCount: 2,
        name: "Top 14",
        nameJa: null,
        season: "2026-27",
        slug: "top-14-2026-27",
        totalRounds: 26,
      },
    ]);
    const { default: CalendarPage } = await import("@/app/calendar/page");

    render(await CalendarPage({}));

    expect(screen.getByLabelText("日程掲載状況")).toHaveTextContent(
      "トップ14 2026-27",
    );
  });

  it("does not show an incomplete competition when it has a fixture in the selected week", async () => {
    matchQueryMock.getMatchesInRange.mockResolvedValue([
      createCalendarMatch({
        competition: {
          family: "top-14",
          id: "top-14-id",
          name: "Top 14",
          nameJa: null,
          season: "2026-27",
          slug: "top-14-2026-27",
        },
      }),
    ]);
    competitionQueryMock.listCompetitionScheduleCoverage.mockResolvedValue([
      {
        family: "top-14",
        ingestedRoundCount: 2,
        name: "Top 14",
        nameJa: null,
        season: "2026-27",
        slug: "top-14-2026-27",
        totalRounds: 26,
      },
    ]);
    const { default: CalendarPage } = await import("@/app/calendar/page");

    render(await CalendarPage({}));

    expect(screen.queryByLabelText("日程掲載状況")).not.toBeInTheDocument();
  });

  it("falls back to current week for invalid week queries", async () => {
    const { default: CalendarPage } = await import("@/app/calendar/page");

    render(
      await CalendarPage({
        searchParams: Promise.resolve({ week: "2026-07-14" }),
      }),
    );

    expect(screen.getByText("7月6日 - 12日 JST")).toBeInTheDocument();
    expect(matchQueryMock.getMatchesInRange).toHaveBeenCalledWith(
      "2026-07-05T15:00:00.000Z",
      "2026-07-12T15:00:00.000Z",
    );
  });
});
