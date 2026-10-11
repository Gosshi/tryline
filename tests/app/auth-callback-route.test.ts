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
      new Request(
        "https://tryline.test/auth/callback?code=abc&next=/pricing?from=hero",
      ),
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
  it.each([
    [undefined, "/"],
    ["/pricing?resume=checkout", "/pricing?resume=checkout"],
    [
      "/matches/1e74662b-af45-4ef1-b267-156eb87329d5",
      "/matches/1e74662b-af45-4ef1-b267-156eb87329d5",
    ],
    ["@evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["https://evil.example/", "/"],
    ["javascript:alert(1)", "/"],
    ["/auth/callback?code=x", "/"],
    ["/pricing?from=hero#plans", "/pricing?from=hero#plans"],
    ["/auth/login", "/"],
    ["//[", "/"],
  ])("validates next=%s as %s", async (next, expected) => {
    supabaseMocks.exchangeCodeForSession.mockResolvedValue({
      data: { user: { created_at: "2026-07-07T23:58:00.000Z" } },
      error: null,
    });
    const url = new URL("https://tryline.test/auth/callback?code=abc");
    if (next !== undefined) url.searchParams.set("next", next);
    const { GET } = await import("@/app/auth/callback/route");
    expect((await GET(new Request(url))).headers.get("location")).toBe(
      `https://tryline.test${expected}`,
    );
  });

  it("keeps checkout resume when marking a new signup", async () => {
    supabaseMocks.exchangeCodeForSession.mockResolvedValue({
      data: { user: { created_at: "2026-07-07T23:59:30.000Z" } },
      error: null,
    });
    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new Request(
        "https://tryline.test/auth/callback?code=abc&next=%2Fpricing%3Fresume%3Dcheckout",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://tryline.test/pricing?resume=checkout&signup=success",
    );
  });
  it.each([
    ["/?auth_error=1", "existing", "/"],
    [
      "/pricing?resume=checkout&auth_error=1",
      "existing",
      "/pricing?resume=checkout",
    ],
    [
      "/matches/1e74662b-af45-4ef1-b267-156eb87329d5?signup=success",
      "existing",
      "/matches/1e74662b-af45-4ef1-b267-156eb87329d5",
    ],
    [
      "/pricing?resume=checkout",
      "new",
      "/pricing?resume=checkout&signup=success",
    ],
    ["/pricing?resume=checkout", "error", "/pricing?auth_error=1"],
    [
      "/c/urc/2025-26?tab=schedule#fixtures",
      "error",
      "/c/urc/2025-26?tab=schedule&auth_error=1#fixtures",
    ],
    [undefined, "error", "/?auth_error=1"],
    ["@evil.example", "error", "/?auth_error=1"],
    ["/auth/callback?code=x", "error", "/?auth_error=1"],
    [
      "/pricing?resume=checkout&signup=success&auth_error=old&from=hero#plans",
      "missing",
      "/pricing?from=hero&auth_error=1#plans",
    ],
  ])("cleans return flags for next=%s (%s)", async (next, result, expected) => {
    supabaseMocks.exchangeCodeForSession.mockResolvedValue({
      data: {
        user: {
          created_at:
            result === "new"
              ? "2026-07-07T23:59:30.000Z"
              : "2026-07-07T23:58:00.000Z",
        },
      },
      error: result === "error" ? { message: "expired code" } : null,
    });
    const url = new URL("https://tryline.test/auth/callback");
    if (result !== "missing") url.searchParams.set("code", "abc");
    if (next !== undefined) url.searchParams.set("next", next);
    const { GET } = await import("@/app/auth/callback/route");
    expect((await GET(new Request(url))).headers.get("location")).toBe(
      `https://tryline.test${expected}`,
    );
  });
});
