import { beforeEach, describe, expect, it, vi } from "vitest";

const openAIMock = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@/lib/llm/client", () => ({
  getOpenAIClient: () => ({
    chat: {
      completions: {
        create: openAIMock.create,
      },
    },
  }),
}));

import { generateImpressionTweet } from "@/lib/x/impression-tweet";

const baseParams = {
  awayScore: 24,
  awayTeamName: "チームB",
  competitionLabel: "リーグワン",
  homeScore: 27,
  homeTeamName: "チームA",
  recapExcerpt:
    "後半20分までチームBがリードしていたが、チームAが終盤に追い上げて3点差で逃げ切った。",
  tryScorers: [
    { count: 2, playerName: "山田" },
    { count: 1, playerName: "鈴木" },
  ],
};

describe("generateImpressionTweet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the OpenAI text when generation succeeds", async () => {
    const text =
      "チームAとチームB、最後まで目が離せなかった。山田の2本目が効いたなあ #リーグワン";
    openAIMock.create.mockResolvedValueOnce({
      choices: [{ message: { content: text } }],
    });

    await expect(generateImpressionTweet(baseParams)).resolves.toBe(text);
    expect(openAIMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 120,
        model: "gpt-4o-mini",
        temperature: 0.9,
      }),
    );
  });

  it("returns null when OpenAI throws", async () => {
    openAIMock.create.mockRejectedValueOnce(new Error("rate limited"));

    await expect(generateImpressionTweet(baseParams)).resolves.toBeNull();
  });

  it("removes URLs and trims overlong tweets to 140 characters", async () => {
    openAIMock.create.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: `${"すごい試合だった。".repeat(20)} https://example.com`,
          },
        },
      ],
    });

    const result = await generateImpressionTweet(baseParams);

    expect(result).not.toContain("https://example.com");
    expect([...(result ?? "")]).toHaveLength(140);
    expect(result?.endsWith("…")).toBe(true);
  });
});