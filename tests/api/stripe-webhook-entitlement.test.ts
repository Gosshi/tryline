import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  eq: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
}));

const stripeMocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
}));

const notificationMocks = vi.hoisted(() => ({
  notifyStripeWebhookIssue: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: dbMocks.from })),
}));

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    webhooks: { constructEvent: stripeMocks.constructEvent },
  })),
}));

vi.mock("@/lib/llm/notify", () => notificationMocks);

import { POST } from "@/app/api/stripe/webhook/route";

const originalEnv = process.env;
const periodEnd = 1_767_139_200;
const periodEndIso = "2025-12-31T00:00:00.000Z";
let warnMock: ReturnType<typeof vi.spyOn> | undefined;

function createRequest() {
  return new Request("http://localhost/api/stripe/webhook", {
    body: "test-event",
    headers: { "stripe-signature": "sig_test" },
    method: "POST",
  });
}

function createSubscription(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    customer: "cus_test",
    id: "sub_test",
    items: { data: [{ current_period_end: periodEnd }] },
    metadata: { userId: "user-1" },
    status: "active",
    ...overrides,
  };
}

function setEvent(type: string, subscription: Record<string, unknown>) {
  stripeMocks.constructEvent.mockReturnValue({
    data: { object: subscription },
    id: "evt_test",
    type,
  });
}

describe("Stripe premium entitlement webhook", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      STRIPE_SECRET_KEY: "sk_test_webhook",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
    };
    dbMocks.eq.mockResolvedValue({ error: null });
    dbMocks.update.mockReturnValue({ eq: dbMocks.eq });
    dbMocks.upsert.mockResolvedValue({ error: null });
    notificationMocks.notifyStripeWebhookIssue.mockResolvedValue(undefined);
    dbMocks.from.mockReturnValue({
      update: dbMocks.update,
      upsert: dbMocks.upsert,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    warnMock?.mockRestore();
    warnMock = undefined;
    vi.clearAllMocks();
  });

  it("writes the item period for the current Stripe event shape", async () => {
    setEvent("customer.subscription.updated", createSubscription());

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe("ok");
    expect(dbMocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        current_period_end: periodEndIso,
        premium_source: "stripe",
        premium_until: periodEndIso,
        subscription_status: "premium",
      }),
    );
  });

  it("supports legacy top-level periods and trialing subscriptions", async () => {
    setEvent(
      "customer.subscription.updated",
      createSubscription({
        current_period_end: periodEnd,
        items: { data: [] },
        status: "trialing",
      }),
    );

    await POST(createRequest());

    expect(dbMocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        current_period_end: periodEndIso,
        premium_source: "stripe",
        premium_until: periodEndIso,
        subscription_status: "premium",
      }),
    );
  });

  it("clears entitlement fields for non-premium subscription statuses", async () => {
    setEvent(
      "customer.subscription.updated",
      createSubscription({ status: "past_due" }),
    );

    await POST(createRequest());

    expect(dbMocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        current_period_end: periodEndIso,
        premium_source: null,
        premium_until: null,
        subscription_status: "free",
      }),
    );
  });

  it("warns and writes null when neither event shape has a period", async () => {
    warnMock = vi.spyOn(console, "warn").mockImplementation(() => {});
    setEvent(
      "customer.subscription.updated",
      createSubscription({ items: { data: [] } }),
    );

    await POST(createRequest());

    expect(warnMock).toHaveBeenCalledWith(
      "Stripe subscription sub_test has no current_period_end.",
    );
    expect(dbMocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        current_period_end: null,
        premium_source: "stripe",
        premium_until: null,
      }),
    );
  });

  it("clears entitlement fields when a subscription is deleted", async () => {
    setEvent(
      "customer.subscription.deleted",
      createSubscription({ items: { data: [] } }),
    );

    await POST(createRequest());

    expect(dbMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        premium_source: null,
        premium_until: null,
        subscription_status: "cancelled",
      }),
    );
    expect(dbMocks.eq).toHaveBeenCalledWith("id", "user-1");
  });

  it("returns 500 and reports identifiers only when an entitlement upsert fails", async () => {
    dbMocks.upsert.mockResolvedValue({
      error: { details: "customer email@example.com", message: "write failed" },
    });
    setEvent("customer.subscription.updated", createSubscription());

    const response = await POST(createRequest());

    expect(response.status).toBe(500);
    expect(notificationMocks.notifyStripeWebhookIssue).toHaveBeenCalledWith({
      eventId: "evt_test",
      eventType: "customer.subscription.updated",
      issueCode: "subscription_upsert_failed",
      userId: "user-1",
    });
  });

  it("returns 500 when a deletion update fails", async () => {
    dbMocks.eq.mockResolvedValue({ error: { message: "write failed" } });
    setEvent("customer.subscription.deleted", createSubscription());

    const response = await POST(createRequest());

    expect(response.status).toBe(500);
    expect(notificationMocks.notifyStripeWebhookIssue).toHaveBeenCalledWith({
      eventId: "evt_test",
      eventType: "customer.subscription.deleted",
      issueCode: "subscription_delete_failed",
      userId: "user-1",
    });
  });

  it("acknowledges a handled event without userId after notifying ops", async () => {
    setEvent(
      "customer.subscription.created",
      createSubscription({ metadata: {} }),
    );

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(notificationMocks.notifyStripeWebhookIssue).toHaveBeenCalledWith({
      eventId: "evt_test",
      eventType: "customer.subscription.created",
      issueCode: "missing_user_id",
    });
    expect(dbMocks.upsert).not.toHaveBeenCalled();
  });

  it("keeps invalid signatures and unsupported event types acknowledged as before", async () => {
    stripeMocks.constructEvent.mockImplementationOnce(() => {
      throw new Error("invalid signature");
    });

    const invalidSignatureResponse = await POST(createRequest());

    expect(invalidSignatureResponse.status).toBe(400);

    setEvent("invoice.created", createSubscription({ metadata: {} }));
    const unsupportedEventResponse = await POST(createRequest());

    expect(unsupportedEventResponse.status).toBe(200);
    expect(notificationMocks.notifyStripeWebhookIssue).not.toHaveBeenCalled();
  });
});
