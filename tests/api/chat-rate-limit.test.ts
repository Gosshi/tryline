import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserProfile: vi.fn(),
  isPremium: vi.fn(),
}));

const updateMock = vi.hoisted(() => vi.fn());
const eqMock = vi.hoisted(() => vi.fn());
const freeQuestionMocks = vi.hoisted(() => {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(),
  };

  return {
    query,
    select: vi.fn(() => query),
    upsert: vi.fn(),
  };
});
const contextMocks = vi.hoisted(() => ({
  assembleMatchContext: vi.fn(),
}));
const llmMocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  getSupabaseServerClientWithAuth: () => ({
    from: (table: string) =>
      table === "chat_free_questions"
        ? {
            select: freeQuestionMocks.select,
            upsert: freeQuestionMocks.upsert,
          }
        : {
            update: updateMock,
          },
  }),
  getUser: authMocks.getUser,
  getUserProfile: authMocks.getUserProfile,
  isPremium: authMocks.isPremium,
}));

vi.mock("@/lib/chat/context", () => ({
  assembleMatchContext: contextMocks.assembleMatchContext,
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
    freeQuestionMocks.query.eq.mockClear();
    freeQuestionMocks.query.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    freeQuestionMocks.select.mockClear();
    freeQuestionMocks.upsert.mockResolvedValue({ error: null });
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

  it("uses request history for context and does not return a session id", async () => {
    authMocks.getUserProfile.mockResolvedValue({
      chat_daily_count: 0,
      chat_daily_reset_date: "2026-05-07",
      stripe_customer_id: "cus_123",
      subscription_status: "premium",
    });

    const { POST } = await import("@/app/api/chat/[matchId]/route");

    const response = await POST(
      new Request("http://localhost/api/chat/match-1", {
        body: JSON.stringify({
          history: [
            { content: "前半の流れは？", role: "user" },
            { content: "接点で差が出ています。", role: "assistant" },
          ],
          message: "後半の注目点は？",
        }),
        method: "POST",
      }),
      { params: Promise.resolve({ matchId: "match-1" }) },
    );

    const text = await response.text();

    expect(llmMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { content: "system prompt", role: "system" },
          { content: "前半の流れは？", role: "user" },
          { content: "接点で差が出ています。", role: "assistant" },
          { content: "後半の注目点は？", role: "user" },
        ],
      }),
    );
    expect(text).toContain('"done":true');
    expect(text).not.toContain("sessionId");
    expect(updateMock).toHaveBeenCalledWith({
      chat_daily_count: 1,
      updated_at: "2026-05-07T12:00:00.000Z",
    });
  });

  it("returns 403 when a non-premium user already used the free question", async () => {
    authMocks.isPremium.mockResolvedValue(false);
    freeQuestionMocks.query.maybeSingle.mockResolvedValue({
      data: { user_id: "user-1" },
      error: null,
    });

    const { POST } = await import("@/app/api/chat/[matchId]/route");

    const response = await POST(
      new Request("http://localhost/api/chat/match-1", {
        body: JSON.stringify({ message: "この試合を分析して" }),
        method: "POST",
      }),
      { params: Promise.resolve({ matchId: "match-1" }) },
    );

    await expect(response.json()).resolves.toEqual({
      error: "free_question_used",
    });
    expect(response.status).toBe(403);
    expect(contextMocks.assembleMatchContext).not.toHaveBeenCalled();
    expect(llmMocks.create).not.toHaveBeenCalled();
  });

  it("allows one non-premium question and records usage after the stream completes", async () => {
    authMocks.isPremium.mockResolvedValue(false);
    authMocks.getUserProfile.mockClear();

    const { POST } = await import("@/app/api/chat/[matchId]/route");

    const response = await POST(
      new Request("http://localhost/api/chat/match-1", {
        body: JSON.stringify({ message: "この試合を分析して" }),
        method: "POST",
      }),
      { params: Promise.resolve({ matchId: "match-1" }) },
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('"done":true');
    expect(authMocks.getUserProfile).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(freeQuestionMocks.upsert).toHaveBeenCalledWith(
      { match_id: "match-1", user_id: "user-1" },
      { ignoreDuplicates: true },
    );
  });
});
