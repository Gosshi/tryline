import { beforeEach, describe, expect, it, vi } from "vitest";

const competitionsMock = vi.hoisted(() => ({
  getCompetitionBySlug: vi.fn(),
  getCompetitionGuide: vi.fn(),
  listFamilies: vi.fn(),
  listSeasonsByFamily: vi.fn(),
  selectLatestSeasonWithMatches: vi.fn(),
}));

const broadcastMock = vi.hoisted(() => ({
  getMatchBroadcastPresenceForMatches: vi.fn(),
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
vi.mock("@/lib/db/queries/match-broadcasts", () => broadcastMock);
vi.mock("@/lib/db/queries/match-content", () => contentMock);
vi.mock("@/lib/db/queries/matches", () => matchesMock);
vi.mock("@/lib/db/queries/standings", () => standingsMock);

import { generateMetadata as generateSeasonMetadata } from "@/app/c/[competition]/[season]/page";
import { generateMetadata as generateHubMetadata } from "@/app/c/[competition]/page";

describe("competition guide metadata", () => {
  beforeEach(() => {
    competitionsMock.getCompetitionBySlug.mockReset();
    broadcastMock.getMatchBroadcastPresenceForMatches.mockResolvedValue(
      new Set(),
    );
    contentMock.getContentStatusForMatches.mockResolvedValue({});
    matchesMock.listMatchesForCompetition.mockResolvedValue([
      { id: "match-id", status: "scheduled" },
    ]);
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
      expect(
        broadcastMock.getMatchBroadcastPresenceForMatches,
      ).toHaveBeenCalledWith(["match-id"]);
      expect(contentMock.getContentStatusForMatches).toHaveBeenCalledWith([
        "match-id",
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
});
