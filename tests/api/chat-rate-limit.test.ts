import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserProfile: vi.fn(),
  isPremium: vi.fn(),
}));

const updateMock = vi.hoisted(() => vi.fn());
const eqMock = vi.hoisted(() => vi.fn());
const chatMocks = vi.hoisted(() => ({
  createChatSession: vi.fn(),
  getChatMessages: vi.fn(),
  getSessionTokenTotal: vi.fn(),
  saveChatMessage: vi.fn(),
}));
const contextMocks = vi.hoisted(() => ({
  assembleMatchContext: vi.fn(),
}));
const llmMocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  getSupabaseServerClientWithAuth: () => ({
    from: () => ({
      update: updateMock,
    }),
  }),
  getUser: authMocks.getUser,
  getUserProfile: authMocks.getUserProfile,
  isPremium: authMocks.isPremium,
}));

vi.mock("@/lib/chat/context", () => ({
  assembleMatchContext: contextMocks.assembleMatchContext,
}));

vi.mock("@/lib/db/queries/chat", () => ({
  createChatSession: chatMocks.createChatSession,
  getChatMessages: chatMocks.getChatMessages,
  getSessionTokenTotal: chatMocks.getSessionTokenTotal,
  saveChatMessage: chatMocks.saveChatMessage,
}));

vi.mock("@/lib/llm/client", () => ({
  getOpenAIClient: () => ({
    chat: {
      completions: {
        create: llmMocks.create,
      },
    },
  }),
}));

describe("chat daily rate limit", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T12:00:00.000Z"));
    chatMocks.createChatSession.mockResolvedValue("session-1");
    chatMocks.getChatMessages.mockResolvedValue([]);
    chatMocks.getSessionTokenTotal.mockResolvedValue(0);
    chatMocks.saveChatMessage.mockResolvedValue(undefined);
    contextMocks.assembleMatchContext.mockResolvedValue("system prompt");
    llmMocks.create.mockResolvedValue(
      (async function* () {
        yield {
          choices: [{ delta: { content: "分析" } }],
        };
        yield {
          choices: [{ delta: {} }],
          usage: { completion_tokens: 20, prompt_tokens: 100 },
        };
      })(),
    );
    authMocks.getUser.mockResolvedValue({ id: "user-1" });
    authMocks.isPremium.mockResolvedValue(true);
    authMocks.getUserProfile.mockResolvedValue({
      chat_daily_count: 30,
      chat_daily_reset_date: "2026-05-07",
      stripe_customer_id: "cus_123",
      subscription_status: "premium",
    });
    eqMock.mockResolvedValue({ error: null });
    updateMock.mockReturnValue({ eq: eqMock });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns 429 when the premium user reaches the daily limit", async () => {
    const { POST } = await import("@/app/api/chat/[matchId]/route");

    const response = await POST(
      new Request("http://localhost/api/chat/match-1", {
        body: JSON.stringify({ message: "この試合を分析して" }),
        method: "POST",
      }),
      { params: Promise.resolve({ matchId: "match-1" }) },
    );

    await expect(response.json()).resolves.toEqual({
      error: "daily_limit_exceeded",
    });
    expect(response.status).toBe(429);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("resets the daily count before checking a new UTC day", async () => {
    authMocks.getUserProfile.mockResolvedValue({
      chat_daily_count: 30,
      chat_daily_reset_date: "2026-05-06",
      stripe_customer_id: "cus_123",
      subscription_status: "premium",
    });

    const { POST } = await import("@/app/api/chat/[matchId]/route");

    const response = await POST(
      new Request("http://localhost/api/chat/match-1", {
        body: JSON.stringify({ message: "この試合を分析して" }),
        method: "POST",
      }),
      { params: Promise.resolve({ matchId: "match-1" }) },
    );

    expect(response.status).not.toBe(429);
    expect(updateMock).toHaveBeenCalledWith({
      chat_daily_count: 0,
      chat_daily_reset_date: "2026-05-07",
      updated_at: "2026-05-07T12:00:00.000Z",
    });
  });
});
