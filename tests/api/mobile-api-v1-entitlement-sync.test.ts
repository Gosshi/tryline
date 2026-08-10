import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bearerMocks = vi.hoisted(() => ({
  getUserFromBearer: vi.fn(),
}));

const envMocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  from: vi.fn(),
  profileEq: vi.fn(),
  profileMaybeSingle: vi.fn(),
  profileSelect: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/auth/bearer", () => bearerMocks);
vi.mock("@/lib/env", () => envMocks);
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: vi.fn(() => ({ from: supabaseMocks.from })),
}));

import { POST } from "@/app/api/v1/me/entitlement/sync/route";

const userId = "a3b24170-1253-4da5-aefc-2e00b47c0ad1";

function createRequest() {
  return new Request("http://localhost/api/v1/me/entitlement/sync", {
    headers: { Authorization: "Bearer valid-token" },
    method: "POST",
  });
}

describe("POST /api/v1/me/entitlement/sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T00:00:00.000Z"));
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    bearerMocks.getUserFromBearer.mockResolvedValue({ id: userId });
    envMocks.getServerEnv.mockReturnValue({
      REVENUECAT_SECRET_API_KEY: "revenuecat-secret-key",
    });
    supabaseMocks.profileMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    supabaseMocks.profileEq.mockReturnValue({
      maybeSingle: supabaseMocks.profileMaybeSingle,
    });
    supabaseMocks.profileSelect.mockReturnValue({ eq: supabaseMocks.profileEq });
    supabaseMocks.upsert.mockResolvedValue({ error: null });
    supabaseMocks.from.mockReturnValue({
      select: supabaseMocks.profileSelect,
      upsert: supabaseMocks.upsert,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns 401 when the request is unauthenticated", async () => {
    bearerMocks.getUserFromBearer.mockResolvedValue(null);

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      data: null,
      error: "unauthorized",
      success: false,
    });
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it("does not overwrite an active Stripe entitlement", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    supabaseMocks.profileMaybeSingle.mockResolvedValue({
      data: {
        premium_source: "stripe",
        premium_until: "2026-09-01T00:00:00.000Z",
      },
      error: null,
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { synced: false },
      error: null,
      success: true,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(supabaseMocks.upsert).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("active Stripe"));
    info.mockRestore();
  });

  it("uses the latest RevenueCat entitlement expiration", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          subscriber: {
            entitlements: {
              premium: { expires_date: "2026-09-01T00:00:00Z" },
              older: { expires_date: "2026-08-12T00:00:00Z" },
            },
          },
        }),
        { status: 200 },
      ),
    );

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      `https://api.revenuecat.com/v1/subscribers/${userId}`,
      expect.objectContaining({
        headers: {
          Accept: "application/json",
          Authorization: "Bearer revenuecat-secret-key",
        },
      }),
    );
    expect(supabaseMocks.upsert).toHaveBeenCalledWith({
      id: userId,
      premium_source: "apple",
      premium_until: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-08-10T00:00:00.000Z",
    });
    expect(await response.json()).toEqual({
      data: { synced: true },
      error: null,
      success: true,
    });
  });
});
