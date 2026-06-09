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

import { generatePreviewThread } from "@/lib/x/preview-thread";

const baseParams = {
  awayTeamName: "France",
  competitionFamily: "six-nations",
  competitionLabel: "Six Nations",
  homeTeamName: "Ireland",
  matchId: "match-1",
  previewMarkdown:
    "# この試合の核心\n\nアイルランドの接点支配がフランスの速攻を止められるか？\n\n# 注目ポイント\n\n- ブレイクダウン\n- キック\n- 終盤",
};

describe("generatePreviewThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a preview thread when OpenAI returns valid JSON", async () => {
    openAIMock.create.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              tweet1: "アイルランドの接点支配はフランスの速攻を止められるか？",
              tweet2:
                "- 接点の優位\n- キック裏の攻防\n- 終盤の規律 #SixNations #ラグビー",
            }),
          },
        },
      ],
    });

    await expect(generatePreviewThread(baseParams)).resolves.toEqual({
      tweet1: "アイルランドの接点支配はフランスの速攻を止められるか？",
      tweet2:
        "- 接点の優位\n- キック裏の攻防\n- 終盤の規律 #SixNations #ラグビー",
      tweet3:
        "試合の流れと見どころを日本語でまとめています 👇\nhttps://www.trylinerugby.com/matches/match-1",
    });
    expect(openAIMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 300,
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.7,
      }),
    );
  });

  it("returns null when OpenAI throws", async () => {
    openAIMock.create.mockRejectedValueOnce(new Error("rate limited"));

    await expect(generatePreviewThread(baseParams)).resolves.toBeNull();
  });

  it("returns null when tweet1 or tweet2 is missing", async () => {
    openAIMock.create.mockResolvedValueOnce({
      choices: [
        { message: { content: JSON.stringify({ tweet1: "問いかけ" }) } },
      ],
    });

    await expect(generatePreviewThread(baseParams)).resolves.toBeNull();
  });
});
