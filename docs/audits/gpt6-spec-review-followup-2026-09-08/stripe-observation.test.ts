import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  event: vi.fn(),
  notify: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mocks.event },
  })),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => ({ upsert: mocks.upsert }) }),
}));
vi.mock("@/lib/llm/notify", () => ({ notifyStripeWebhookIssue: mocks.notify }));

import { POST } from "@/app/api/stripe/webhook/route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("acknowledges non-UUID metadata without writing it to the database or notification", async () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_review");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.event.mockReturnValue({
    id: "evt_synthetic_review",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_synthetic_review",
        customer: "cus_synthetic_review",
        status: "active",
        metadata: { userId: "synthetic-user@example.invalid" },
        items: { data: [{ current_period_end: 1_800_000_000 }] },
      },
    },
  });
  const response = await POST(
    new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "synthetic" },
      body: "synthetic",
    }),
  );

  expect(response.status).toBe(200);
  expect(mocks.upsert).not.toHaveBeenCalled();
  expect(mocks.notify).toHaveBeenCalledWith({
    eventId: "evt_synthetic_review",
    eventType: "customer.subscription.updated",
    issueCode: "invalid_user_id_format",
  });
});
