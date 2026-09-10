import { beforeEach, describe, expect, it, vi } from "vitest";

const competitionsMock = vi.hoisted(() => ({
  getCompetitionBySlug: vi.fn(),
  getCompetitionGuide: vi.fn(),
  listFamilies: vi.fn(),
  listSeasonsByFamily: vi.fn(),
  selectLatestSeasonWithMatches: vi.fn(),
}));

const contentMock = vi.hoisted(() => ({
  getContentStatusForMatches: vi.fn(),
}));

const matchesMock = vi.hoisted(() => ({
  listMatchesForCompetition: vi.fn(),
}));

const standingsMock = vi.hoisted(() => ({
  getStandingsForCompetition: vi.fn(),
}));

vi.mock("@/lib/db/queries/competitions", () => competitionsMock);
vi.mock("@/lib/db/queries/match-content", () => contentMock);
vi.mock("@/lib/db/queries/matches", () => matchesMock);
vi.mock("@/lib/db/queries/standings", () => standingsMock);

import {
  generateMetadata as generateSeasonMetadata,
  getCompetitionMetadataTeams,
} from "@/app/c/[competition]/[season]/page";
import { generateMetadata as generateHubMetadata } from "@/app/c/[competition]/page";

import type { MatchListItem } from "@/lib/db/queries/matches";

const scheduledMatches = [
  {
    awayTeam: { name: "Team B", shortCode: "TMB", slug: "team-b" },
    id: "match-id-1",
    homeTeam: { name: "Team A", shortCode: "TMA", slug: "team-a" },
    kickoffAt: "2026-08-09T05:00:00.000Z",
    status: "scheduled",
  },
  {
    awayTeam: { name: "Team D", shortCode: "TMD", slug: "team-d" },
    id: "match-id-2",
    homeTeam: { name: "Team C", shortCode: "TMC", slug: "team-c" },
    kickoffAt: "2026-08-16T05:00:00.000Z",
    status: "scheduled",
  },
  {
    awayTeam: { name: "Team F", shortCode: "TMF", slug: "team-f" },
    id: "match-id-3",
    homeTeam: { name: "Team E", shortCode: "TME", slug: "team-e" },
    kickoffAt: "2026-08-23T05:00:00.000Z",
    status: "scheduled",
  },
];

describe("competition guide metadata", () => {
  beforeEach(() => {
    competitionsMock.getCompetitionBySlug.mockReset();
    contentMock.getContentStatusForMatches.mockResolvedValue({});
    matchesMock.listMatchesForCompetition.mockResolvedValue(scheduledMatches);
    standingsMock.getStandingsForCompetition.mockResolvedValue([]);
  });

  it("includes standings and viewing guidance in hub metadata", async () => {
    const metadata = await generateHubMetadata({
      params: Promise.resolve({ competition: "urc" }),
    });

    expect(metadata.title).toContain("順位表");
    expect(metadata.title).toContain("視聴方法");
    expect(metadata.description).toContain("日本での視聴方法");
    expect(JSON.stringify(metadata.openGraph?.images)).toContain(
      "/api/og?type=competition",
    );
    const ogImage = Array.isArray(metadata.openGraph?.images)
      ? metadata.openGraph.images[0]
      : metadata.openGraph?.images;
    const ogImageUrl =
      typeof ogImage === "string" || ogImage instanceof URL
        ? ogImage
        : ogImage?.url;
    const url = new URL(ogImageUrl?.toString() ?? "", "https://example.com");
    expect(url.searchParams.get("family_name")).toBe(
      "ユナイテッド・ラグビー・チャンピオンシップ",
    );
  });

  it("adds Lipovitan Challenge Cup participants to the family hub title", async () => {
    const metadata = await generateHubMetadata({
      params: Promise.resolve({ competition: "lipovitan-challenge-cup" }),
    });

    expect(metadata.title).toContain("オーストラリア代表");
    expect(metadata.title).toContain("カナダ代表");
    expect(metadata.title).toContain("フィジー代表");
  });

  it.each([
    {
      competition: "pnc",
      family: "pnc",
      nameJa: "パシフィック・ネーションズカップ",
      season: "2026",
      title: "パシフィック・ネーションズカップ 2026 日程・見どころ",
    },
    {
      competition: "six-nations",
      family: "six-nations",
      nameJa: "シックスネイションズ",
      season: "2026",
      title: "シックスネイションズ 2026 日程・見どころ",
    },
    {
      competition: "urc",
      family: "urc",
      nameJa: "URC",
      season: "2025-26",
      title: "URC 2025-26 日程・見どころ",
    },
  ])(
    "uses a state-aware title for $competition/$season",
    async ({ competition, family, nameJa, season, title }) => {
      competitionsMock.getCompetitionBySlug.mockResolvedValue({
        champion: null,
        endDate: "2026-06-20",
        family,
        id: "competition-id",
        matchCount: 10,
        name: `${nameJa} ${season}`,
        nameJa,
        publishedContentCount: 5,
        season,
        slug: `${competition}-${season}`,
        startDate: "2025-09-26",
      });

      const metadata = await generateSeasonMetadata({
        params: Promise.resolve({ competition, season }),
      });

      expect(metadata.title).toBe(title);
      expect(metadata.description).toContain("日程・見どころ");
      expect(matchesMock.listMatchesForCompetition).toHaveBeenCalledWith(
        `${competition}-${season}`,
      );
      expect(standingsMock.getStandingsForCompetition).toHaveBeenCalledWith(
        `${competition}-${season}`,
      );
      expect(contentMock.getContentStatusForMatches).toHaveBeenCalledWith([
        "match-id-1",
        "match-id-2",
        "match-id-3",
      ]);
      expect(JSON.stringify(metadata.openGraph?.images)).toContain(
        "/api/og?type=competition",
      );
      expect(JSON.stringify(metadata.openGraph?.images)).toContain(
        `season=${season}`,
      );

      if (family === "six-nations") {
        expect(metadata.description).toContain("6カ国対抗");
      } else {
        expect(metadata.description).not.toContain("6カ国対抗");
      }
    },
  );

  it("uses the small-team match list in Lipovitan season metadata", async () => {
    const teams = [
      { name: "Japan", nameJa: "日本代表", shortCode: "JPN", slug: "japan" },
      {
        name: "Australia",
        nameJa: "オーストラリア代表",
        shortCode: "AUS",
        slug: "australia",
      },
      {
        name: "Canada",
        nameJa: "カナダ代表",
        shortCode: "CAN",
        slug: "canada",
      },
      { name: "Fiji", nameJa: "フィジー代表", shortCode: "FIJ", slug: "fiji" },
    ];
    competitionsMock.getCompetitionBySlug.mockResolvedValue({
      champion: null,
      endDate: "2026-10-24",
      family: "lipovitan-challenge-cup",
      id: "competition-id",
      matchCount: 4,
      name: "Lipovitan-D Challenge Cup 2026",
      nameJa: "リポビタンDチャレンジカップ2026",
      publishedContentCount: 0,
      season: "2026",
      slug: "lipovitan-challenge-cup-2026",
      startDate: "2026-08-09",
    });
    matchesMock.listMatchesForCompetition.mockResolvedValue([
      {
        awayTeam: teams[1],
        id: "match-id-1",
        homeTeam: teams[0],
        kickoffAt: "2026-08-09T05:00:00.000Z",
        status: "scheduled",
      },
      {
        awayTeam: teams[3],
        id: "match-id-2",
        homeTeam: teams[2],
        kickoffAt: "2026-10-24T05:00:00.000Z",
        status: "scheduled",
      },
    ]);

    const metadata = await generateSeasonMetadata({
      params: Promise.resolve({
        competition: "lipovitan-challenge-cup",
        season: "2026",
      }),
    });

    expect(metadata.title).toContain("日本代表");
    expect(metadata.title).toContain("オーストラリア代表");
    expect(metadata.description).not.toBe(
      "リポビタンDチャレンジカップ2026 の日程・見どころを掲載。",
    );
    expect(metadata.description).toContain("全2試合");
    expect(metadata.description).not.toMatch(/DAZN|J SPORTS|WOWOW/);
  });

  it("does not enumerate teams above the title threshold", async () => {
    competitionsMock.getCompetitionBySlug.mockResolvedValue({
      champion: null,
      endDate: "2026-09-20",
      family: "pnc",
      id: "competition-id",
      matchCount: 6,
      name: "Pacific Nations Cup 2026",
      nameJa: "パシフィック・ネーションズカップ",
      publishedContentCount: 0,
      season: "2026",
      slug: "pnc-2026",
      startDate: "2026-08-09",
    });

    const metadata = await generateSeasonMetadata({
      params: Promise.resolve({ competition: "pnc", season: "2026" }),
    });

    expect(metadata.title).toBe(
      "パシフィック・ネーションズカップ 2026 日程・見どころ",
    );
    expect(metadata.title).not.toContain("Team A");
  });

  it("falls back from an empty Japanese team name and sorts consistently", () => {
    const matches: MatchListItem[] = [
      {
        awayTeam: { name: "Beta", nameJa: "", shortCode: "BET", slug: "beta" },
        awayScore: null,
        homeTeam: {
          name: "Alpha",
          nameJa: null,
          shortCode: "ALP",
          slug: "alpha",
        },
        homeScore: null,
        id: "match-id",
        kickoffAt: "2026-08-09T05:00:00.000Z",
        poolName: null,
        round: null,
        roundName: null,
        status: "scheduled",
        venue: null,
      },
    ];

    const first = getCompetitionMetadataTeams(matches, []);
    const second = getCompetitionMetadataTeams(matches, []);

    expect(first).toEqual(["Alpha", "Beta"]);
    expect(second).toEqual(first);
  });
});
