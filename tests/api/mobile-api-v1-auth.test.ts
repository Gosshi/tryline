import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
}));

const envMock = vi.hoisted(() => ({
  getPublicEnv: vi.fn(() => ({
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  })),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: supabaseMock.createClient,
}));
vi.mock("@/lib/env", () => envMock);

describe("mobile API v1 Bearer authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.createClient.mockReturnValue({
      auth: { getUser: supabaseMock.getUser },
    });
  });

  it("returns null without a Bearer token", async () => {
    const { getUserFromBearer } = await import("@/lib/auth/bearer");
    const user = await getUserFromBearer(
      new Request("http://localhost/api/v1/me"),
    );

    expect(user).toBeNull();
    expect(supabaseMock.createClient).not.toHaveBeenCalled();
  });

  it("validates a Bearer token with Supabase and binds it to the client", async () => {
    supabaseMock.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    const { getUserFromBearer } = await import("@/lib/auth/bearer");
    const user = await getUserFromBearer(
      new Request("http://localhost/api/v1/me", {
        headers: { Authorization: "Bearer access-token" },
      }),
    );

    expect(user).toEqual({ id: "user-1" });
    expect(supabaseMock.getUser).toHaveBeenCalledWith("access-token");
    expect(supabaseMock.createClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      expect.objectContaining({
        global: {
          headers: { Authorization: "Bearer access-token" },
        },
      }),
    );
  });

  it("treats invalid and expired tokens as anonymous", async () => {
    supabaseMock.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error("expired token"),
    });

    const { getUserFromBearer } = await import("@/lib/auth/bearer");
    const user = await getUserFromBearer(
      new Request("http://localhost/api/v1/calendar", {
        headers: { Authorization: "Bearer expired-token" },
      }),
    );

    expect(user).toBeNull();
  });
});
