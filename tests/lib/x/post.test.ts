import { describe, expect, it } from "vitest";

import { buildTweetText } from "@/lib/x/post";

import type { XPostParams } from "@/lib/x/post";

const baseParams: XPostParams = {
  awayScore: 17,
  awayTeamName: "France",
  competitionFamily: null,
  competitionLabel: "Six Nations",
  contentType: "recap",
  homeScore: 24,
  homeTeamName: "Ireland",
  language: "en",
  matchId: "match-1",
  recapExcerpt: "A compact review excerpt.",
};

describe("buildTweetText", () => {
  it("uses Six Nations hashtags for English posts", () => {
    const text = buildTweetText({
      ...baseParams,
      competitionFamily: "six-nations",
      language: "en",
    });

    expect(text).toContain("#SixNations #Rugby");
    expect(text).not.toContain("#LeagueOne");
  });

  it("uses League One hashtags for Japanese posts", () => {
    const text = buildTweetText({
      ...baseParams,
      competitionFamily: "league-one",
      language: "ja",
    });

    expect(text).toContain("#リーグワン #ラグビー");
  });

  it("falls back to default hashtags when competition family is null", () => {
    expect(
      buildTweetText({
        ...baseParams,
        competitionFamily: null,
        language: "en",
      }),
    ).toContain("#Rugby");
    expect(
      buildTweetText({
        ...baseParams,
        competitionFamily: null,
        language: "ja",
      }),
    ).toContain("#ラグビー #Rugby");
  });
});
