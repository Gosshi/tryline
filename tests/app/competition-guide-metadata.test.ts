import { beforeEach, describe, expect, it, vi } from "vitest";

const competitionsMock = vi.hoisted(() => ({
  getCompetitionBySlug: vi.fn(),
  getCompetitionGuide: vi.fn(),
  listFamilies: vi.fn(),
  listSeasonsByFamily: vi.fn(),
  selectLatestSeasonWithMatches: vi.fn(),
}));

vi.mock("@/lib/db/queries/competitions", () => competitionsMock);

import { generateMetadata as generateSeasonMetadata } from "@/app/c/[competition]/[season]/page";
import { generateMetadata as generateHubMetadata } from "@/app/c/[competition]/page";

describe("competition guide metadata", () => {
  beforeEach(() => {
    competitionsMock.getCompetitionBySlug.mockReset();
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
    expect(JSON.stringify(metadata.openGraph?.images)).toContain(
      "family_name=URC",
    );
  });

  it.each([
    {
      competition: "pnc",
      family: "pnc",
      nameJa: "パシフィック・ネーションズカップ",
      season: "2026",
      title: "パシフィック・ネーションズカップ 2026 順位表・日程・結果",
    },
    {
      competition: "six-nations",
      family: "six-nations",
      nameJa: "シックスネイションズ",
      season: "2026",
      title: "シックスネイションズ 2026 順位表・日程・結果",
    },
    {
      competition: "urc",
      family: "urc",
      nameJa: "URC",
      season: "2025-26",
      title: "URC 2025-26 順位表・日程・結果",
    },
  ])(
    "uses a standings-first title for $competition/$season",
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
      expect(metadata.description).toContain("日本での視聴方法");
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
