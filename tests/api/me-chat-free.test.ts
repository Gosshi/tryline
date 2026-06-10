import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isPremium: vi.fn(),
}));

const freeQuestionMocks = vi.hoisted(() => {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(),
  };

  return {
    query,
    select: vi.fn(() => query),
  };
});

vi.mock("@/lib/auth/server", () => ({
  getSupabaseServerClientWithAuth: () => ({
    from: () => ({
      select: freeQuestionMocks.select,
    }),
  }),
  getUser: authMocks.getUser,
  isPremium: authMocks.isPremium,
}));

describe("GET /api/me/chat-free/[matchId]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    authMocks.getUser.mockResolvedValue({ id: "user-1" });
    authMocks.isPremium.mockResolvedValue(false);
    freeQuestionMocks.query.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
  });

  it("returns no free question for anonymous users", async () => {
    authMocks.getUser.mockResolvedValue(null);
    const { GET } = await import("@/app/api/me/chat-free/[matchId]/route");

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ matchId: "match-1" }),
    });

    await expect(response.json()).resolves.toEqual({
      hasFreeQuestion: false,
      isLoggedIn: false,
    });
  });

  it("always returns true for premium users", async () => {
    authMocks.isPremium.mockResolvedValue(true);
    const { GET } = await import("@/app/api/me/chat-free/[matchId]/route");

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ matchId: "match-1" }),
    });

    await expect(response.json()).resolves.toEqual({
      hasFreeQuestion: true,
      isLoggedIn: true,
    });
    expect(freeQuestionMocks.select).not.toHaveBeenCalled();
  });

  it("returns true for non-premium users before usage", async () => {
    const { GET } = await import("@/app/api/me/chat-free/[matchId]/route");

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ matchId: "match-1" }),
    });

    await expect(response.json()).resolves.toEqual({
      hasFreeQuestion: true,
      isLoggedIn: true,
    });
  });

  it("returns false for non-premium users after usage", async () => {
    freeQuestionMocks.query.maybeSingle.mockResolvedValue({
      data: { user_id: "user-1" },
      error: null,
    });
    const { GET } = await import("@/app/api/me/chat-free/[matchId]/route");

    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ matchId: "match-1" }),
    });

    await expect(response.json()).resolves.toEqual({
      hasFreeQuestion: false,
      isLoggedIn: true,
    });
  });
});
