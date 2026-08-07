import { beforeEach, describe, expect, it, vi } from "vitest";

const clientMock = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@/lib/llm/client", () => ({
  getOpenAIClient: () => ({
    responses: clientMock,
  }),
}));

describe("createWebSearchJsonResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMock.create.mockResolvedValue({
      model: "gpt-4o",
      output_text: '{"facts":[]}',
      usage: { input_tokens: 3, output_tokens: 4 },
    });
  });

  it("uses web search without JSON mode", async () => {
    const { createWebSearchJsonResponse } = await import("@/lib/llm/openai");

    const result = await createWebSearchJsonResponse({
      input: "Find sourced facts",
      model: "gpt-4o",
    });

    expect(result.text).toBe('{"facts":[]}');
    expect(clientMock.create).toHaveBeenCalledWith({
      input: "Find sourced facts",
      model: "gpt-4o",
      tools: [{ type: "web_search_preview" }],
    });
  });
});

describe("createTextResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clientMock.create.mockResolvedValue({
      model: "gpt-5.6-terra",
      output_text: "generated content",
      usage: { input_tokens: 3, output_tokens: 4 },
    });
  });

  it("sends only supported text response options", async () => {
    const { createTextResponse } = await import("@/lib/llm/openai");

    await createTextResponse({
      input: "Generate a preview",
      model: "gpt-5.6-terra",
    });

    expect(clientMock.create).toHaveBeenCalledWith({
      input: "Generate a preview",
      model: "gpt-5.6-terra",
    });
  });
});
