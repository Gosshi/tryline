import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BILLING_TERMS } from "@/lib/billing/terms";

const authMocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  maybeSingle: vi.fn(),
}));

const stripeMocks = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
}));

vi.mock("@/lib/auth/server", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  requireUser: authMocks.requireUser,
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: vi.fn() })),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: authMocks.maybeSingle })),
      })),
    })),
  })),
}));

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: stripeMocks.createCheckoutSession,
      },
    },
  })),
}));

describe("POST /api/stripe/checkout", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      STRIPE_PREMIUM_PRICE_ID: "price_test",
      STRIPE_SECRET_KEY: "sk_test_checkout",
    };
    authMocks.maybeSingle.mockResolvedValue({ data: { premium_until: null } });
    authMocks.requireUser.mockResolvedValue({
      email: "fan@example.com",
      id: "user-1",
    });
    stripeMocks.createCheckoutSession.mockResolvedValue({
      url: "https://checkout.stripe.test/session",
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it("creates a checkout subscription with the configured trial", async () => {
    const { POST } = await import("@/app/api/stripe/checkout/route");

    await POST();

    expect(stripeMocks.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_data: {
          metadata: { userId: "user-1" },
          trial_period_days: BILLING_TERMS.trialDays,
          trial_settings: {
            end_behavior: { missing_payment_method: "cancel" },
          },
        },
      }),
    );
  });
  it("redirects active Premium users without creating Stripe checkout", async () => {
    authMocks.maybeSingle.mockResolvedValue({
      data: { premium_until: "2999-01-01T00:00:00.000Z" },
    });
    const { POST } = await import("@/app/api/stripe/checkout/route");
    const response = await POST();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://www.trylinerugby.com/pricing?already_premium=1",
    );
    expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
    const { default: Stripe } = await import("stripe");
    expect(Stripe).not.toHaveBeenCalled();
    expect(authMocks.maybeSingle).toHaveBeenCalledOnce();
  });

  it.each([null, "2000-01-01T00:00:00.000Z"])(
    "creates checkout when premium_until=%s",
    async (premium_until) => {
      authMocks.maybeSingle.mockResolvedValue({ data: { premium_until } });
      const { POST } = await import("@/app/api/stripe/checkout/route");
      const response = await POST();
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        "https://checkout.stripe.test/session",
      );
      expect(stripeMocks.createCheckoutSession).toHaveBeenCalledOnce();
      expect(authMocks.maybeSingle).toHaveBeenCalledOnce();
    },
  );
});
