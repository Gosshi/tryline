// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import CompetitionHubPage from "@/app/c/[competition]/page";
import { metadata as rwc2027Metadata } from "@/app/c/rwc/2027/page";

const competitionMocks = vi.hoisted(() => ({
  getCompetitionGuide: vi.fn(),
  listFamilies: vi.fn(),
  listSeasonsByFamily: vi.fn(),
}));

const matchMocks = vi.hoisted(() => ({
  getRecentlyReviewedMatchesForFamily: vi.fn(),
  listMatchesForCompetition: vi.fn(),
}));

const standingsMocks = vi.hoisted(() => ({
  getPoolStandingsForCompetition: vi.fn(),
  getStandingsForCompetition: vi.fn(),
}));

const broadcastMocks = vi.hoisted(() => ({
  getMatchBroadcastsForMatches: vi.fn(),
}));

vi.mock("next/image", () => ({
  default: (props: { alt: string; src: string }) => (
    <div aria-label={props.alt} data-src={props.src} role="img" />
  ),
}));

vi.mock("@/components/competition-viewing-guide", () => ({
  CompetitionViewingGuide: () => (
    <section>
      <h2>大会ガイド</h2>
    </section>
  ),
}));

vi.mock("@/components/match-card", () => ({
  MatchCard: () => null,
}));

vi.mock("@/lib/db/queries/competitions", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/db/queries/competitions")
  >("@/lib/db/queries/competitions");

  return {
    ...actual,
    getCompetitionGuide: competitionMocks.getCompetitionGuide,
    listFamilies: competitionMocks.listFamilies,
    listSeasonsByFamily: competitionMocks.listSeasonsByFamily,
  };
});

vi.mock("@/lib/db/queries/matches", () => ({
  getRecentlyReviewedMatchesForFamily:
    matchMocks.getRecentlyReviewedMatchesForFamily,
  listMatchesForCompetition: matchMocks.listMatchesForCompetition,
}));

vi.mock("@/lib/db/queries/standings", () => ({
  getPoolStandingsForCompetition: standingsMocks.getPoolStandingsForCompetition,
  getStandingsForCompetition: standingsMocks.getStandingsForCompetition,
}));

vi.mock("@/lib/db/queries/match-broadcasts", () => ({
  getMatchBroadcastsForMatches: broadcastMocks.getMatchBroadcastsForMatches,
}));

function match(
  id: string,
  kickoffAt: string,
  options: {
    awaySlug?: string;
    awayScore?: number | null;
    homeSlug?: string;
    homeScore?: number | null;
    status?:
      | "cancelled"
      | "finished"
      | "in_progress"
      | "postponed"
      | "scheduled";
  } = {},
) {
  return {
    awayScore: options.awayScore ?? null,
    awayTeam: {
      name: options.awaySlug === "japan" ? "Japan" : "New Zealand",
      shortCode: options.awaySlug === "japan" ? "JPN" : "NZL",
      slug: options.awaySlug ?? "new-zealand",
    },
    homeScore: options.homeScore ?? null,
    homeTeam: {
      name: options.homeSlug === "japan" ? "Japan" : "France",
      shortCode: options.homeSlug === "japan" ? "JPN" : "FRA",
      slug: options.homeSlug ?? "france",
    },
    id,
    kickoffAt,
    poolName: null,
    round: null,
    roundName: null,
    status: options.status ?? "scheduled",
    venue: null,
  };
}

const standings = [
  {
    bonusPointsLosing: 0,
    bonusPointsTry: 0,
    drawn: 0,
    lost: 0,
    played: 3,
    pointsAgainst: 10,
    pointsFor: 90,
    position: 1,
    teamName: "Fiji",
    teamShortCode: "FIJ",
    totalPoints: 12,
    triesFor: 12,
    won: 3,
  },
  {
    bonusPointsLosing: 0,
    bonusPointsTry: 0,
    drawn: 0,
    lost: 1,
    played: 3,
    pointsAgainst: 30,
    pointsFor: 70,
    position: 2,
    teamName: "Japan",
    teamShortCode: "JPN",
    totalPoints: 8,
    triesFor: 9,
    won: 2,
  },
  {
    bonusPointsLosing: 0,
    bonusPointsTry: 0,
    drawn: 0,
    lost: 2,
    played: 3,
    pointsAgainst: 40,
    pointsFor: 50,
    position: 3,
    teamName: "Samoa",
    teamShortCode: "SAM",
    totalPoints: 4,
    triesFor: 5,
    won: 1,
  },
  {
    bonusPointsLosing: 0,
    bonusPointsTry: 0,
    drawn: 0,
    lost: 3,
    played: 3,
    pointsAgainst: 70,
    pointsFor: 20,
    position: 4,
    teamName: "USA",
    teamShortCode: "USA",
    totalPoints: 0,
    triesFor: 2,
    won: 0,
  },
];

describe("competition hub indexing", () => {
  beforeEach(() => {
    competitionMocks.listFamilies.mockResolvedValue(["rwc"]);
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
      },
    ]);
    competitionMocks.getCompetitionGuide.mockResolvedValue(null);
    matchMocks.getRecentlyReviewedMatchesForFamily.mockResolvedValue([]);
    matchMocks.listMatchesForCompetition.mockResolvedValue([]);
    standingsMocks.getStandingsForCompetition.mockResolvedValue([]);
    standingsMocks.getPoolStandingsForCompetition.mockResolvedValue([]);
    broadcastMocks.getMatchBroadcastsForMatches.mockResolvedValue(new Map());
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("links the bare hub to the newest season with matches", async () => {
    const { container } = render(
      await CompetitionHubPage({
        params: Promise.resolve({ competition: "rwc" }),
      }),
    );

    expect(screen.queryByText("最新シーズン")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "ラグビーワールドカップ2027の日程・結果",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /全日程・結果を見る/ }),
    ).toHaveAttribute("href", "/c/rwc/2027");
    expect(container.querySelector("main > div.max-w-6xl")).toBeInTheDocument();
  });

  it("uses local key visuals when an image is available", async () => {
    competitionMocks.listSeasonsByFamily.mockResolvedValue([
      {
        champion: null,
        endDate: "2026-06-20",
        family: "premiership",
        id: "premiership-2025-26",
        matchCount: 93,
        name: "Premiership Rugby 2025-26",
        nameJa: "プレミアシップ 2025-26",
        publishedContentCount: 10,
        season: "2025-26",
        slug: "premiership-2025-26",
        startDate: "2025-09-26",
      },
    ]);

    render(
      await CompetitionHubPage({
        params: Promise.resolve({ competition: "premiership" }),
      }),
    );

    expect(screen.getByRole("img", { name: "プレミアシップ" })).toHaveAttribute(
      "data-src",
      "/visuals/premiership.jpg",
    );
  });

  it("uses batch two local key visuals when available", async () => {
    competitionMocks.listSeasonsByFamily.mockResolvedValue([
      {
        champion: null,
        endDate: "2026-06-20",
        family: "urc",
        id: "urc-2025-26",
        matchCount: 151,
        name: "United Rugby Championship 2025-26",
        nameJa: "URC 2025-26",
        publishedContentCount: 10,
        season: "2025-26",
        slug: "urc-2025-26",
        startDate: "2025-09-26",
      },
    ]);

    render(
      await CompetitionHubPage({
        params: Promise.resolve({ competition: "urc" }),
      }),
    );

    expect(
      screen.getByRole("img", {
        name: "ユナイテッド・ラグビー・チャンピオンシップ",
      }),
    ).toHaveAttribute("data-src", "/visuals/urc.jpg");
  });

  it("uses the Nations Championship key visual when it is available", async () => {
    competitionMocks.listSeasonsByFamily.mockResolvedValue([
      {
        champion: null,
        endDate: "2027-12-01",
        family: "nations-championship",
        id: "nations-championship-2026",
        matchCount: 36,
        name: "Nations Championship 2026",
        nameJa: "ネーションズチャンピオンシップ2026",
        publishedContentCount: 0,
        season: "2026",
        slug: "nations-championship-2026",
        startDate: "2026-07-01",
      },
    ]);

    render(
      await CompetitionHubPage({
        params: Promise.resolve({ competition: "nations-championship" }),
      }),
    );

    expect(
      screen.getByRole("img", { name: "ネーションズチャンピオンシップ" }),
    ).toHaveAttribute("data-src", "/visuals/nations-championship.jpg");
  });

  it("shows the RWC preseason dates, next matches, and Japan fixtures", async () => {
    competitionMocks.listSeasonsByFamily.mockResolvedValue([
      {
        champion: null,
        endDate: null,
        family: "rwc",
        id: "rwc-2027",
        matchCount: 36,
        name: "Rugby World Cup 2027",
        nameJa: "ラグビーワールドカップ2027",
        publishedContentCount: 0,
        season: "2027",
        slug: "rwc-2027",
        startDate: null,
        totalRounds: null,
      },
    ]);
    matchMocks.listMatchesForCompetition.mockResolvedValue([
      match("rwc-1", "2027-10-01T18:45:00Z", { homeSlug: "japan" }),
      match("rwc-2", "2027-10-02T09:00:00Z"),
      match("rwc-3", "2027-10-03T09:00:00Z", { awaySlug: "japan" }),
      match("rwc-4", "2027-10-04T09:00:00Z", { homeSlug: "japan" }),
    ]);

    render(
      await CompetitionHubPage({
        params: Promise.resolve({ competition: "rwc" }),
      }),
    );

    expect(screen.getByText("開幕前")).toBeInTheDocument();
    expect(
      screen.getByText("2027年10月1日〜2027年11月13日"),
    ).toBeInTheDocument();
    const nextSection = screen
      .getByRole("heading", { name: "次の試合（日本時間）" })
      .closest("section");
    expect(nextSection).not.toBeNull();
    expect(
      within(nextSection as HTMLElement).getAllByRole("link", { name: /対/ }),
    ).toHaveLength(3);
    expect(
      within(nextSection as HTMLElement).getAllByRole("link")[0],
    ).toHaveAttribute("href", "/matches/rwc-1");
    const japanSection = screen
      .getByRole("heading", { name: "日本代表の試合" })
      .closest("section");
    expect(japanSection).not.toBeNull();
    expect(
      within(japanSection as HTMLElement).getAllByRole("link", {
        name: /Japan/,
      }),
    ).toHaveLength(3);
    expect(
      screen.queryByRole("heading", { name: "最終順位" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /^順位$/ }),
    ).not.toBeInTheDocument();
  });

  it("does not infer a period for unknown or preseason seasons from stored dates", async () => {
    competitionMocks.listSeasonsByFamily.mockResolvedValue([
      {
        champion: null,
        endDate: null,
        family: "rwc",
        id: "rwc-2031",
        matchCount: 52,
        name: "Rugby World Cup 2031",
        nameJa: "ラグビーワールドカップ2031",
        publishedContentCount: 0,
        season: "2031",
        slug: "rwc-2031",
        startDate: null,
      },
    ]);
    matchMocks.listMatchesForCompetition.mockResolvedValue([
      match("unknown", "2027-10-01T18:45:00Z"),
    ]);
    render(
      await CompetitionHubPage({
        params: Promise.resolve({ competition: "rwc" }),
      }),
    );
    expect(
      screen.queryByText("2027年10月1日〜2027年11月13日"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/2027年10月/)).not.toBeInTheDocument();

    cleanup();
    competitionMocks.listSeasonsByFamily.mockResolvedValue([
      {
        champion: null,
        endDate: "2027-06-03",
        family: "premiership",
        id: "premiership-2026-27",
        matchCount: 90,
        name: "Premiership Rugby 2026-27",
        nameJa: "プレミアシップ 2026-27",
        publishedContentCount: 10,
        season: "2026-27",
        slug: "premiership-2026-27",
        startDate: "2026-09-25",
      },
    ]);
    matchMocks.listMatchesForCompetition.mockResolvedValue([
      match("prem-1", "2026-09-25T10:00:00Z"),
    ]);
    render(
      await CompetitionHubPage({
        params: Promise.resolve({ competition: "premiership" }),
      }),
    );
    expect(screen.getByText("開幕前")).toBeInTheDocument();
    expect(screen.queryByText(/2026年9月25日/)).not.toBeInTheDocument();
    expect(screen.queryByText(/2027年6月3日/)).not.toBeInTheDocument();
  });

  it("shows post-season JST dates, Japan scores, champion, and standings", async () => {
    competitionMocks.listSeasonsByFamily.mockResolvedValue([
      {
        champion: "Fiji",
        endDate: "2026-09-19",
        family: "pnc",
        id: "pnc-2026",
        matchCount: 4,
        name: "Pacific Nations Cup 2026",
        nameJa: "パシフィック・ネーションズカップ2026",
        publishedContentCount: 4,
        season: "2026",
        slug: "pnc-2026",
        startDate: "2026-09-12",
      },
    ]);
    matchMocks.listMatchesForCompetition.mockResolvedValue([
      match("pnc-1", "2026-09-12T10:05:00Z", {
        homeSlug: "japan",
        homeScore: 63,
        awayScore: 14,
        status: "finished",
      }),
      match("pnc-2", "2026-09-19T15:30:00Z", {
        awaySlug: "japan",
        homeScore: 30,
        awayScore: 20,
        status: "finished",
      }),
      match("pnc-3", "2026-09-18T09:00:00Z", { status: "finished" }),
      match("pnc-cancelled", "2026-09-26T10:00:00Z", { status: "cancelled" }),
    ]);
    standingsMocks.getStandingsForCompetition.mockResolvedValue(standings);

    render(
      await CompetitionHubPage({
        params: Promise.resolve({ competition: "pnc" }),
      }),
    );

    expect(screen.getByText("終了")).toBeInTheDocument();
    expect(
      screen.getByText("2026年9月12日〜2026年9月20日"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "次の試合（日本時間）" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/63–14/)).toBeInTheDocument();
    expect(screen.getByText("最終順位")).toBeInTheDocument();
    expect(screen.getByText("優勝: Fiji")).toBeInTheDocument();
  });

  it("omits Japan when it is absent and displays the remaining schedule link", async () => {
    matchMocks.listMatchesForCompetition.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) =>
        match(`match-${index + 1}`, `2027-10-0${index + 1}T09:00:00Z`),
      ),
    );
    render(
      await CompetitionHubPage({
        params: Promise.resolve({ competition: "rwc" }),
      }),
    );

    expect(
      screen.queryByRole("heading", { name: "日本代表の試合" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/日本代表は出場しません/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "残り 2 試合の日程を見る →" }),
    ).toHaveAttribute("href", "/c/rwc/2027#schedule");
  });

  it("omits preseason standings and renders only the summary band for an empty season", async () => {
    standingsMocks.getStandingsForCompetition.mockResolvedValue(
      standings.map((row) => ({ ...row, played: 0 })),
    );
    matchMocks.listMatchesForCompetition.mockResolvedValue([
      match("scheduled", "2027-10-01T18:45:00Z"),
    ]);
    render(
      await CompetitionHubPage({
        params: Promise.resolve({ competition: "rwc" }),
      }),
    );
    expect(
      screen.queryByRole("heading", { name: /^順位$/ }),
    ).not.toBeInTheDocument();

    cleanup();
    matchMocks.listMatchesForCompetition.mockResolvedValue([]);
    standingsMocks.getStandingsForCompetition.mockResolvedValue([]);
    render(
      await CompetitionHubPage({
        params: Promise.resolve({ competition: "rwc" }),
      }),
    );
    expect(
      screen.getByRole("link", { name: /全日程・結果を見る/ }),
    ).toHaveAttribute("href", "/c/rwc/2027");
    expect(
      screen.queryByRole("heading", { name: "次の試合（日本時間）" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "日本代表の試合" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "日本での視聴方法" }),
    ).not.toBeInTheDocument();
  });

  it("renders the summary before recent reviews, the guide, and all seasons", async () => {
    matchMocks.getRecentlyReviewedMatchesForFamily.mockResolvedValue([
      match("review", "2026-01-01T00:00:00Z", { status: "finished" }),
    ]);
    const { container } = render(
      await CompetitionHubPage({
        params: Promise.resolve({ competition: "rwc" }),
      }),
    );
    const main = container.querySelector("main > div.max-w-6xl");
    const labels = [
      "ラグビーワールドカップ2027の日程・結果",
      "最近のレビュー",
      "大会ガイド",
      "全シーズン",
    ];
    const positions = labels.map((label) =>
      (main?.textContent ?? "").indexOf(label),
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual(
      [...positions].sort((left, right) => left - right),
    );
  });

  it("exports ISR and static competition params", async () => {
    const { generateStaticParams, revalidate } =
      await import("@/app/c/[competition]/page");
    competitionMocks.listFamilies.mockResolvedValue(["rwc", "pnc"]);

    expect(revalidate).toBe(3600);
    await expect(generateStaticParams()).resolves.toEqual([
      { competition: "rwc" },
      { competition: "pnc" },
    ]);
  });

  it("uses Japanese RWC 2027 metadata for schedule and viewing queries", () => {
    expect(rwc2027Metadata.title).toContain("ラグビーワールドカップ2027");
    expect(rwc2027Metadata.title).toContain("日程");
    expect(rwc2027Metadata.title).toContain("出場国");
    expect(rwc2027Metadata.description).toContain("放送");
    expect(rwc2027Metadata.description).toContain("日本語レビュー");
  });
});
