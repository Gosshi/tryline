import { beforeEach, describe, expect, it, vi } from "vitest";

const competitionsMock = vi.hoisted(() => ({
  getCompetitionBySlug: vi.fn(),
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
  });

  it("includes standings and viewing guidance in season metadata", async () => {
    competitionsMock.getCompetitionBySlug.mockResolvedValue({
      champion: null,
      endDate: "2026-06-20",
      family: "urc",
      id: "competition-id",
      matchCount: 10,
      name: "URC 2025-26",
      nameJa: "URC 2025-26",
      publishedContentCount: 5,
      season: "2025-26",
      slug: "urc-2025-26",
      startDate: "2025-09-26",
      viewingGuideJa: null,
    });

    const metadata = await generateSeasonMetadata({
      params: Promise.resolve({
        competition: "urc",
        season: "2025-26",
      }),
    });

    expect(metadata.title).toContain("順位表");
    expect(metadata.description).toContain("日本での視聴方法");
  });
});
