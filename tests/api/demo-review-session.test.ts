import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  generateLink: vi.fn(),
  verifyOtp: vi.fn(),
}));

const envMock = vi.hoisted(() => ({
  getPublicEnv: vi.fn(() => ({
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: authMocks.createClient,
}));
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: vi.fn(() => ({
    auth: { admin: { generateLink: authMocks.generateLink } },
  })),
}));
vi.mock("@/lib/env", () => envMock);

const routeRequest = (body: unknown) =>
  new Request("http://localhost/api/v1/auth/demo-review-session", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

describe("POST /api/v1/auth/demo-review-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_REVIEW_DEMO_EMAIL", "reviewer@example.com");
    vi.stubEnv("APP_REVIEW_DEMO_OTP", "review-secret-code");
    authMocks.createClient.mockReturnValue({
      auth: { verifyOtp: authMocks.verifyOtp },
    });
    authMocks.generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "hashed-token" } },
      error: null,
    });
    authMocks.verifyOtp.mockResolvedValue({
      data: {
        session: {
          access_token: "access-token",
          refresh_token: "refresh-token",
        },
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 404 while the demo credentials are not fully configured", async () => {
    vi.stubEnv("APP_REVIEW_DEMO_EMAIL", "");
    vi.stubEnv("APP_REVIEW_DEMO_OTP", "");
    const { POST } =
      await import("@/app/api/v1/auth/demo-review-session/route");

    const response = await POST(
      routeRequest({
        code: "review-secret-code",
        email: "reviewer@example.com",
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      data: null,
      error: "not_found",
      success: false,
    });
    expect(authMocks.generateLink).not.toHaveBeenCalled();
  });

  it("treats a partially configured bypass as disabled", async () => {
    vi.stubEnv("APP_REVIEW_DEMO_EMAIL", "");
    const { POST } =
      await import("@/app/api/v1/auth/demo-review-session/route");

    const missingEmailResponse = await POST(
      routeRequest({
        code: "review-secret-code",
        email: "reviewer@example.com",
      }),
    );

    expect(missingEmailResponse.status).toBe(404);
    expect(authMocks.generateLink).not.toHaveBeenCalled();

    vi.stubEnv("APP_REVIEW_DEMO_EMAIL", "reviewer@example.com");
    vi.stubEnv("APP_REVIEW_DEMO_OTP", "");
    const missingCodeResponse = await POST(
      routeRequest({
        code: "review-secret-code",
        email: "reviewer@example.com",
      }),
    );

    expect(missingCodeResponse.status).toBe(404);
    expect(authMocks.generateLink).not.toHaveBeenCalled();
  });

  it("issues a session only when the configured credentials match", async () => {
    const { POST } =
      await import("@/app/api/v1/auth/demo-review-session/route");

    const response = await POST(
      routeRequest({
        code: "review-secret-code",
        email: "REVIEWER@example.com",
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        access_token: "access-token",
        refresh_token: "refresh-token",
      },
      error: null,
      success: true,
    });
    expect(authMocks.generateLink).toHaveBeenCalledWith({
      email: "reviewer@example.com",
      type: "magiclink",
    });
    expect(authMocks.verifyOtp).toHaveBeenCalledWith({
      token_hash: "hashed-token",
      type: "magiclink",
    });
    expect(authMocks.createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      expect.objectContaining({
        auth: { autoRefreshToken: false, persistSession: false },
      }),
    );
  });

  it("uses an identical 401 response for incorrect email, incorrect code, and a missing demo user", async () => {
    const { POST } =
      await import("@/app/api/v1/auth/demo-review-session/route");
    const invalidCode = await POST(
      routeRequest({ code: "incorrect-code", email: "reviewer@example.com" }),
    );
    const invalidEmail = await POST(
      routeRequest({ code: "review-secret-code", email: "other@example.com" }),
    );
    authMocks.generateLink.mockResolvedValueOnce({
      data: { properties: { hashed_token: null } },
      error: new Error("user not found"),
    });
    const missingUser = await POST(
      routeRequest({
        code: "review-secret-code",
        email: "reviewer@example.com",
      }),
    );

    expect(invalidCode.status).toBe(401);
    expect(invalidEmail.status).toBe(401);
    expect(missingUser.status).toBe(401);
    await expect(invalidCode.json()).resolves.toEqual({
      data: null,
      error: "invalid_credentials",
      success: false,
    });
    await expect(invalidEmail.json()).resolves.toEqual({
      data: null,
      error: "invalid_credentials",
      success: false,
    });
    await expect(missingUser.json()).resolves.toEqual({
      data: null,
      error: "invalid_credentials",
      success: false,
    });
  });
});
