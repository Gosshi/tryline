import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
}));

const cookieMocks = vi.hoisted(() => ({
  getAll: vi.fn(() => []),
  set: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: supabaseMocks.exchangeCodeForSession,
    },
  })),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: cookieMocks.getAll,
    set: cookieMocks.set,
  })),
}));

describe("GET /auth/callback", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T00:00:00.000Z"));
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-test",
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.test",
    };
    supabaseMocks.exchangeCodeForSession.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("adds signup=success for a newly created user", async () => {
    supabaseMocks.exchangeCodeForSession.mockResolvedValue({
      data: {
        user: { created_at: "2026-07-07T23:59:30.000Z" },
      },
      error: null,
    });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new Request("https://tryline.test/auth/callback?code=abc&next=/pricing?from=hero"),
    );

    expect(response.headers.get("location")).toBe(
      "https://tryline.test/pricing?from=hero&signup=success",
    );
  });

  it("does not add signup=success for an existing user", async () => {
    supabaseMocks.exchangeCodeForSession.mockResolvedValue({
      data: {
        user: { created_at: "2026-07-07T23:58:59.000Z" },
      },
      error: null,
    });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new Request("https://tryline.test/auth/callback?code=abc&next=/pricing"),
    );

    expect(response.headers.get("location")).toBe(
      "https://tryline.test/pricing",
    );
  });
});
