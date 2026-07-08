import { describe, expect, it } from "vitest";

import { createRoundScoreboardOgImage } from "@/lib/seo/og-image";
import { buildRoundScoreboardUrlFromCliArgs } from "@/tools/get-round-scoreboard-url";

describe("OG image helpers", () => {
  it("builds round scoreboard OG image URLs", () => {
    expect(
      createRoundScoreboardOgImage({
        competitionId: "competition-1",
        competitionLabel: "Premiership 2025-26",
        round: 4,
      }),
    ).toEqual({
      height: 630,
      url: "/api/og?type=round-scoreboard&competition_id=competition-1&round=4&competition=Premiership+2025-26",
      width: 1200,
    });
  });

  it("builds round scoreboard URLs from CLI args", () => {
    expect(
      buildRoundScoreboardUrlFromCliArgs([
        "--competition-id=competition-1",
        "--round=4",
        "--competition=Premiership 2025-26",
        "--site-url=https://tryline.test",
      ]),
    ).toBe(
      "https://tryline.test/api/og?type=round-scoreboard&competition_id=competition-1&round=4&competition=Premiership+2025-26",
    );
  });
});
