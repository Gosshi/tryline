import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ event: vi.fn(), notify: vi.fn(), upsert: vi.fn() }));
vi.mock("stripe", () => ({ default: vi.fn().mockImplementation(() => ({ webhooks: { constructEvent: mocks.event } })) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: () => ({ upsert: mocks.upsert }) }) }));
vi.mock("@/lib/llm/notify", () => ({ notifyStripeWebhookIssue: mocks.notify }));

import { POST } from "@/app/api/stripe/webhook/route";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it("forwards non-UUID metadata verbatim to the ops notification on a DB error", async () => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_synthetic_review");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.event.mockReturnValue({
    id: "evt_synthetic_review", type: "customer.subscription.updated",
    data: { object: {
      id: "sub_synthetic_review", customer: "cus_synthetic_review", status: "active",
      metadata: { userId: "synthetic-user@example.invalid" },
      items: { data: [{ current_period_end: 1800000000 }] },
    } },
  });
  mocks.upsert.mockResolvedValue({ error: { code: "22P02" } });
  const response = await POST(new Request("http://localhost/api/stripe/webhook", {
    method: "POST", headers: { "stripe-signature": "synthetic" }, body: "synthetic",
  }));
  expect(response.status).toBe(500);
  expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "synthetic-user@example.invalid" }));
});
