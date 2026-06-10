import { beforeEach, describe, expect, it, vi } from "vitest";

const twitterMock = vi.hoisted(() => ({
  tweet: vi.fn(),
}));

const mediaMock = vi.hoisted(() => ({
  fetchOgImageBuffer: vi.fn(),
  uploadMediaToX: vi.fn(),
}));

vi.mock("twitter-api-v2", () => ({
  TwitterApi: vi.fn(() => ({
    v2: {
      tweet: twitterMock.tweet,
    },
  })),
}));

vi.mock("@/lib/x/media", () => mediaMock);

import {
  buildLinklessReplyText,
  buildReplyText,
  buildTweetText,
  postMatchRecapToX,
} from "@/lib/x/post";

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
    mediaMock.fetchOgImageBuffer.mockResolvedValue(Buffer.from([1, 2, 3]));
    mediaMock.uploadMediaToX.mockResolvedValue("media-1");
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
      "Match review 👇\nhttps://www.trylinerugby.com/matches/match-1/en?utm_source=x&utm_medium=social&utm_campaign=recap&utm_content=match-1",
    );
    expect(buildReplyText("match-1", "ja")).toBe(
      "試合レビューはこちら 👇\nhttps://www.trylinerugby.com/matches/match-1?utm_source=x&utm_medium=social&utm_campaign=recap&utm_content=match-1",
    );
    expect(buildReplyText("match-1", "ja", "preview")).toBe(
      "試合プレビューはこちら 👇\nhttps://www.trylinerugby.com/matches/match-1?utm_source=x&utm_medium=social&utm_campaign=preview&utm_content=match-1",
    );
  });

  it("builds a URL-free reply draft", () => {
    expect(buildLinklessReplyText("ja", "recap")).toBe(
      "レビュー全文はTrylineで公開しています。\n記事URLまたはプロフィールのリンクからどうぞ。",
    );
    expect(buildLinklessReplyText("en", "preview")).toBe(
      "Preview is available on Tryline.\nOpen it from the article URL or profile link.",
    );
  });

  it("posts the URL-free reply after the main tweet", async () => {
    process.env.X_EN_ACCESS_TOKEN_SECRET = "secret";
    process.env.X_EN_ACCESS_TOKEN = "token";
    process.env.X_EN_API_KEY = "key";
    process.env.X_EN_API_KEY_SECRET = "key-secret";
    twitterMock.tweet.mockResolvedValueOnce({ data: { id: "tweet-1" } });
    twitterMock.tweet.mockResolvedValueOnce({ data: { id: "reply-1" } });

    await expect(postMatchRecapToX(baseParams)).resolves.toBe("tweet-1");

    expect(mediaMock.fetchOgImageBuffer).toHaveBeenCalledWith({
      away: "France",
      awayScore: 17,
      competition: "Six Nations",
      home: "Ireland",
      homeScore: 24,
    });
    expect(mediaMock.uploadMediaToX).toHaveBeenCalledWith(
      expect.anything(),
      Buffer.from([1, 2, 3]),
      "image/png",
    );
    expect(twitterMock.tweet).toHaveBeenNthCalledWith(
      1,
      expect.not.stringContaining("https://www.trylinerugby.com"),
      { media: { media_ids: ["media-1"] } },
    );
    expect(twitterMock.tweet).toHaveBeenNthCalledWith(
      2,
      "Review is available on Tryline.\nOpen it from the article URL or profile link.",
      { reply: { in_reply_to_tweet_id: "tweet-1" } },
    );
  });

  it("continues with a text-only recap post when media upload fails", async () => {
    process.env.X_EN_ACCESS_TOKEN_SECRET = "secret";
    process.env.X_EN_ACCESS_TOKEN = "token";
    process.env.X_EN_API_KEY = "key";
    process.env.X_EN_API_KEY_SECRET = "key-secret";
    mediaMock.uploadMediaToX.mockRejectedValueOnce(new Error("upload failed"));
    twitterMock.tweet.mockResolvedValueOnce({ data: { id: "tweet-1" } });
    twitterMock.tweet.mockResolvedValueOnce({ data: { id: "reply-1" } });

    await expect(postMatchRecapToX(baseParams)).resolves.toBe("tweet-1");

    expect(twitterMock.tweet).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      undefined,
    );
  });

  it("does not attach media for preview posts", async () => {
    process.env.X_EN_ACCESS_TOKEN_SECRET = "secret";
    process.env.X_EN_ACCESS_TOKEN = "token";
    process.env.X_EN_API_KEY = "key";
    process.env.X_EN_API_KEY_SECRET = "key-secret";
    twitterMock.tweet.mockResolvedValueOnce({ data: { id: "tweet-1" } });
    twitterMock.tweet.mockResolvedValueOnce({ data: { id: "reply-1" } });

    await expect(
      postMatchRecapToX({ ...baseParams, contentType: "preview" }),
    ).resolves.toBe("tweet-1");

    expect(mediaMock.fetchOgImageBuffer).not.toHaveBeenCalled();
    expect(mediaMock.uploadMediaToX).not.toHaveBeenCalled();
  });

  it("does not attach media when a recap has no score", async () => {
    process.env.X_EN_ACCESS_TOKEN_SECRET = "secret";
    process.env.X_EN_ACCESS_TOKEN = "token";
    process.env.X_EN_API_KEY = "key";
    process.env.X_EN_API_KEY_SECRET = "key-secret";
    twitterMock.tweet.mockResolvedValueOnce({ data: { id: "tweet-1" } });
    twitterMock.tweet.mockResolvedValueOnce({ data: { id: "reply-1" } });

    await expect(
      postMatchRecapToX({ ...baseParams, awayScore: null }),
    ).resolves.toBe("tweet-1");

    expect(mediaMock.fetchOgImageBuffer).not.toHaveBeenCalled();
    expect(mediaMock.uploadMediaToX).not.toHaveBeenCalled();
  });
});
