import { beforeEach, describe, expect, it, vi } from "vitest";

const twitterMock = vi.hoisted(() => ({
  tweet: vi.fn(),
}));

vi.mock("twitter-api-v2", () => ({
  TwitterApi: vi.fn(() => ({
    v2: {
      tweet: twitterMock.tweet,
    },
  })),
}));

import { buildReplyText, buildTweetText, postMatchRecapToX } from "@/lib/x/post";

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("does not include the match URL in the main tweet", () => {
    const text = buildTweetText(baseParams);

    expect(text).not.toContain("https://www.trylinerugby.com/matches/match-1");
    expect(text).not.toContain("▶️");
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

  it("builds a language-specific reply with the match URL", () => {
    expect(buildReplyText("match-1", "en")).toBe(
      "Full AI analysis 👇\nhttps://www.trylinerugby.com/matches/match-1/en",
    );
    expect(buildReplyText("match-1", "ja")).toBe(
      "AI 戦術分析の全文はこちら 👇\nhttps://www.trylinerugby.com/matches/match-1",
    );
  });

  it("posts the URL reply after the main tweet", async () => {
    process.env.X_EN_ACCESS_TOKEN_SECRET = "secret";
    process.env.X_EN_ACCESS_TOKEN = "token";
    process.env.X_EN_API_KEY = "key";
    process.env.X_EN_API_KEY_SECRET = "key-secret";
    twitterMock.tweet.mockResolvedValueOnce({ data: { id: "tweet-1" } });
    twitterMock.tweet.mockResolvedValueOnce({ data: { id: "reply-1" } });

    await expect(postMatchRecapToX(baseParams)).resolves.toBe("tweet-1");

    expect(twitterMock.tweet).toHaveBeenNthCalledWith(
      1,
      expect.not.stringContaining("https://www.trylinerugby.com"),
    );
    expect(twitterMock.tweet).toHaveBeenNthCalledWith(
      2,
      "Full AI analysis 👇\nhttps://www.trylinerugby.com/matches/match-1/en",
      { reply: { in_reply_to_tweet_id: "tweet-1" } },
    );
  });
});
