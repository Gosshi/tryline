import { describe, expect, it } from "vitest";

import {
  createCalendarOgImage,
  createRoundScoreboardOgImage,
} from "@/lib/seo/og-image";
import { buildRoundScoreboardUrlFromCliArgs } from "@/tools/get-round-scoreboard-url";

describe("OG image helpers", () => {
  it("builds calendar OG image URLs with optional focus match", () => {
    expect(
      createCalendarOgImage({
        competitionCount: 5,
        focusAway: "France",
        focusCompetition: "Nations Championship 2026",
        focusHome: "Japan",
        matchCount: 12,
        weekLabel: "7月14日 - 20日 JST",
      }),
    ).toEqual({
      height: 630,
      url: "/api/og?type=calendar&week_label=7%E6%9C%8814%E6%97%A5+-+20%E6%97%A5+JST&match_count=12&competition_count=5&focus_home=Japan&focus_away=France&focus_competition=Nations+Championship+2026",
      width: 1200,
    });
  });

  it("omits calendar focus params unless both teams are present", () => {
    expect(
      createCalendarOgImage({
        competitionCount: 0,
        focusHome: "Japan",
        matchCount: 0,
        weekLabel: "7月28日 - 8月3日 JST",
      }).url,
    ).toBe(
      "/api/og?type=calendar&week_label=7%E6%9C%8828%E6%97%A5+-+8%E6%9C%883%E6%97%A5+JST&match_count=0&competition_count=0",
    );
  });

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
