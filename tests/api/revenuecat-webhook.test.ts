import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  authGetUserById: vi.fn(),
  from: vi.fn(),
  profileEq: vi.fn(),
  profileMaybeSingle: vi.fn(),
  profileSelect: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/env", () => envMocks);
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: vi.fn(() => ({
    auth: { admin: { getUserById: supabaseMocks.authGetUserById } },
    from: supabaseMocks.from,
  })),
}));

import { POST } from "@/app/api/revenuecat/webhook/route";
import { isProfilePremium } from "@/lib/auth/server";

const userId = "a3b24170-1253-4da5-aefc-2e00b47c0ad1";
const secondUserId = "b3b24170-1253-4da5-aefc-2e00b47c0ad1";
const expirationAtMs = Date.parse("2026-09-01T00:00:00.000Z");
const now = new Date("2026-08-10T00:00:00.000Z");

function createRequest(
  event: Record<string, unknown>,
  authorization = "revenuecat-webhook-secret",
) {
  return new Request("http://localhost/api/revenuecat/webhook", {
    body: JSON.stringify({ event }),
    headers: { Authorization: authorization },
    method: "POST",
  });
}

describe("POST /api/revenuecat/webhook", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.clearAllMocks();
    envMocks.getServerEnv.mockReturnValue({
      REVENUECAT_WEBHOOK_SECRET: "revenuecat-webhook-secret",
    });
    supabaseMocks.authGetUserById.mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
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
    vi.useRealTimers();
  });

  it("returns 401 when the Authorization header does not match", async () => {
    const response = await POST(
      createRequest(
        {
          app_user_id: userId,
          expiration_at_ms: expirationAtMs,
          type: "INITIAL_PURCHASE",
        },
        "incorrect-secret",
      ),
    );

    expect(response.status).toBe(401);
    expect(supabaseMocks.authGetUserById).not.toHaveBeenCalled();
  });

  it.each(["EXPIRATION", "REFUND"])(
    "%s always ends entitlement when expiration is past, future, or missing",
    async (type) => {
      const cases = [
        {
          expected: "2026-08-01T00:00:00.000Z",
          expiration_at_ms: Date.parse("2026-08-01T00:00:00.000Z"),
          name: "past",
        },
        {
          expected: now.toISOString(),
          expiration_at_ms: expirationAtMs,
          name: "future",
        },
        {
          expected: now.toISOString(),
          expiration_at_ms: undefined,
          name: "missing",
        },
      ];

      for (const testCase of cases) {
        supabaseMocks.upsert.mockClear();
        const event: Record<string, unknown> = {
          app_user_id: userId,
          type,
        };

        if (testCase.expiration_at_ms !== undefined) {
          event.expiration_at_ms = testCase.expiration_at_ms;
        }

        const response = await POST(createRequest(event));

        expect(response.status, testCase.name).toBe(200);
        expect(supabaseMocks.upsert).toHaveBeenCalledWith({
          id: userId,
          premium_source: "apple",
          premium_until: testCase.expected,
          updated_at: now.toISOString(),
        });
        expect(
          isProfilePremium(
            { premium_until: testCase.expected },
            new Date(now),
          ),
          testCase.name,
        ).toBe(false);
      }
    },
  );

  it("writes the event expiration for a continuing event", async () => {
    const response = await POST(
      createRequest({
        app_user_id: userId,
        expiration_at_ms: expirationAtMs,
        type: "RENEWAL",
      }),
    );

    expect(response.status).toBe(200);
    expect(supabaseMocks.upsert).toHaveBeenCalledWith({
      id: userId,
      premium_source: "apple",
      premium_until: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-08-10T00:00:00.000Z",
    });
  });

  it("revokes a transferred Apple entitlement", async () => {
    supabaseMocks.profileMaybeSingle.mockResolvedValue({
      data: {
        premium_source: "apple",
        premium_until: "2026-09-01T00:00:00.000Z",
      },
      error: null,
    });

    const response = await POST(
      createRequest({
        transferred_from: [userId],
        type: "TRANSFER",
      }),
    );

    expect(response.status).toBe(200);
    expect(supabaseMocks.upsert).toHaveBeenCalledWith({
      id: userId,
      premium_source: "apple",
      premium_until: now.toISOString(),
      updated_at: now.toISOString(),
    });
    expect(
      isProfilePremium(
        { premium_until: now.toISOString() },
        new Date(now),
      ),
    ).toBe(false);
  });

  it("revokes every resolved Apple entitlement in transferred_from", async () => {
    supabaseMocks.authGetUserById.mockImplementation(async (id: string) => ({
      data: { user: { id } },
      error: null,
    }));
    supabaseMocks.profileMaybeSingle
      .mockResolvedValueOnce({
        data: { premium_source: "apple", premium_until: "2026-09-01T00:00:00.000Z" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { premium_source: "apple", premium_until: "2026-09-01T00:00:00.000Z" },
        error: null,
      });

    const response = await POST(
      createRequest({
        transferred_from: [userId, secondUserId],
        type: "TRANSFER",
      }),
    );

    expect(response.status).toBe(200);
    expect(supabaseMocks.upsert).toHaveBeenCalledTimes(2);
    expect(supabaseMocks.upsert).toHaveBeenNthCalledWith(1, {
      id: userId,
      premium_source: "apple",
      premium_until: now.toISOString(),
      updated_at: now.toISOString(),
    });
    expect(supabaseMocks.upsert).toHaveBeenNthCalledWith(2, {
      id: secondUserId,
      premium_source: "apple",
      premium_until: now.toISOString(),
      updated_at: now.toISOString(),
    });
  });

  it.each(["stripe", "manual", null])(
    "does not change a %s entitlement during a transfer",
    async (premiumSource) => {
      supabaseMocks.profileMaybeSingle.mockResolvedValue({
        data: {
          premium_source: premiumSource,
          premium_until: "2026-09-01T00:00:00.000Z",
        },
        error: null,
      });

      const response = await POST(
        createRequest({
          transferred_from: [userId],
          type: "TRANSFER",
        }),
      );

      expect(response.status).toBe(200);
      expect(supabaseMocks.upsert).not.toHaveBeenCalled();
    },
  );

  it.each([[], undefined])(
    "acknowledges a transfer with transferred_from=%j without writing",
    async (transferredFrom) => {
      const response = await POST(
        createRequest({
          transferred_from: transferredFrom,
          type: "TRANSFER",
        }),
      );

      expect(response.status).toBe(200);
      expect(supabaseMocks.authGetUserById).not.toHaveBeenCalled();
      expect(supabaseMocks.upsert).not.toHaveBeenCalled();
    },
  );

  it("processes resolved IDs when an anonymous ID is also transferred", async () => {
    supabaseMocks.profileMaybeSingle.mockResolvedValue({
      data: {
        premium_source: "apple",
        premium_until: "2026-09-01T00:00:00.000Z",
      },
      error: null,
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await POST(
      createRequest({
        transferred_from: ["$RCAnonymousID:anonymous", userId],
        type: "TRANSFER",
      }),
    );

    expect(response.status).toBe(200);
    expect(supabaseMocks.authGetUserById).toHaveBeenCalledTimes(1);
    expect(supabaseMocks.authGetUserById).toHaveBeenCalledWith(userId);
    expect(supabaseMocks.upsert).toHaveBeenCalledWith({
      id: userId,
      premium_source: "apple",
      premium_until: now.toISOString(),
      updated_at: now.toISOString(),
    });
    warn.mockRestore();
  });

  it("keeps a transferred entitlement non-Premium when retried", async () => {
    supabaseMocks.profileMaybeSingle.mockResolvedValue({
      data: {
        premium_source: "apple",
        premium_until: "2026-09-01T00:00:00.000Z",
      },
      error: null,
    });
    const event = {
      transferred_from: [userId],
      type: "TRANSFER",
    };

    await POST(createRequest(event));
    await POST(createRequest(event));

    expect(supabaseMocks.upsert).toHaveBeenCalledTimes(2);
    for (const [write] of supabaseMocks.upsert.mock.calls) {
      expect(
        isProfilePremium(
          { premium_until: write.premium_until },
          new Date(now),
        ),
      ).toBe(false);
    }
  });

  it("does not overwrite an active Stripe entitlement", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    supabaseMocks.profileMaybeSingle.mockResolvedValue({
      data: {
        premium_source: "stripe",
        premium_until: "2026-09-02T00:00:00.000Z",
      },
      error: null,
    });

    const response = await POST(
      createRequest({
        app_user_id: userId,
        expiration_at_ms: expirationAtMs,
        type: "RENEWAL",
      }),
    );

    expect(response.status).toBe(200);
    expect(supabaseMocks.upsert).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith(expect.stringContaining("active Stripe"));
    info.mockRestore();
  });

  it("acknowledges an unresolved app_user_id without writing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    supabaseMocks.authGetUserById.mockResolvedValue({
      data: { user: null },
      error: { status: 404 },
    });

    const response = await POST(
      createRequest({
        app_user_id: userId,
        expiration_at_ms: expirationAtMs,
        type: "INITIAL_PURCHASE",
      }),
    );

    expect(response.status).toBe(200);
    expect(supabaseMocks.upsert).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "[revenuecat] Skipping event for an unresolved app_user_id.",
    );
    warn.mockRestore();
  });

  it("is idempotent when RevenueCat retries the same event", async () => {
    const request = createRequest({
      app_user_id: userId,
      expiration_at_ms: expirationAtMs,
      type: "INITIAL_PURCHASE",
    });

    const first = await POST(request);
    const second = await POST(
      createRequest({
        app_user_id: userId,
        expiration_at_ms: expirationAtMs,
        type: "INITIAL_PURCHASE",
      }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(supabaseMocks.upsert).toHaveBeenCalledTimes(2);
    expect(supabaseMocks.upsert.mock.calls[0]).toEqual(
      supabaseMocks.upsert.mock.calls[1],
    );
  });
});
