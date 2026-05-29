import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
}));

const stripeMocks = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  requireUser: authMocks.requireUser,
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

  it("creates a checkout subscription with a 7-day trial", async () => {
    const { POST } = await import("@/app/api/stripe/checkout/route");

    await POST();

    expect(stripeMocks.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        subscription_data: {
          metadata: { userId: "user-1" },
          trial_period_days: 7,
          trial_settings: {
            end_behavior: { missing_payment_method: "cancel" },
          },
        },
      }),
    );
  });
});