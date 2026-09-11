import { beforeEach, describe, expect, it, vi } from "vitest";

type SubscriberLookup = {
  data: { created_at?: string; id: string; status?: string } | null;
  error: { message: string } | null;
};

type StatefulSubscriber = {
  confirmationToken: string | null;
  created_at: string;
  id: string;
  status: string;
};

const dbMock = vi.hoisted(() => {
  const state = {
    lookupResults: [] as SubscriberLookup[],
    statefulSubscriber: null as StatefulSubscriber | null,
    updateError: null as { message: string } | null,
    upsert: vi.fn(),
    update: vi.fn(),
  };

  return state;
});

const newsletterMock = vi.hoisted(() => ({
  sendConfirmationEmail: vi.fn(),
}));

vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({
    from: (table: string) => {
      if (table !== "email_subscribers") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: () => {
          const filters: Array<[string, unknown]> = [];
          const query = {
            eq: (column: string, value: unknown) => {
              filters.push([column, value]);
              return query;
            },
            maybeSingle: () => {
              const token = filters.find(
                ([column]) => column === "confirmation_token",
              )?.[1];
              const subscriber = dbMock.statefulSubscriber;

              if (subscriber) {
                return Promise.resolve({
                  data:
                    token === subscriber.confirmationToken
                      ? {
                          created_at: subscriber.created_at,
                          id: subscriber.id,
                          status: subscriber.status,
                        }
                      : null,
                  error: null,
                });
              }

              return Promise.resolve(
                dbMock.lookupResults.shift() ?? { data: null, error: null },
              );
            },
          };

          return query;
        },
        update: (values: unknown) => {
          dbMock.update(values);
          const filters: Array<[string, unknown]> = [];
          const query = {
            eq: (column: string, value: unknown) => {
              filters.push([column, value]);
              return query;
            },
            then: <T>(
              resolve: (value: { error: { message: string } | null }) => T,
            ) => {
              const subscriber = dbMock.statefulSubscriber;
              const subscriberId = filters.find(
                ([column]) => column === "id",
              )?.[1];
              const token = filters.find(
                ([column]) => column === "confirmation_token",
              )?.[1];

              if (
                subscriber &&
                !dbMock.updateError &&
                subscriber.id === subscriberId &&
                subscriber.confirmationToken === token
              ) {
                const updatedValues = values as {
                  confirmation_token?: string | null;
                  status?: string;
                };

                if ("confirmation_token" in updatedValues) {
                  subscriber.confirmationToken =
                    updatedValues.confirmation_token ?? null;
                }
                if (updatedValues.status) {
                  subscriber.status = updatedValues.status;
                }
              }

              return Promise.resolve(resolve({ error: dbMock.updateError }));
            },
          };

          return query;
        },
        upsert: dbMock.upsert,
      };
    },
  }),
}));

vi.mock("@/lib/newsletter", () => newsletterMock);

function subscribeRequest(email: string, ip = "203.0.113.1") {
  return new Request("http://localhost/api/newsletter/subscribe", {
    body: JSON.stringify({ email, source: "calendar" }),
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    method: "POST",
  });
}

describe("newsletter API routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    dbMock.lookupResults = [];
    dbMock.statefulSubscriber = null;
    dbMock.updateError = null;
    dbMock.upsert.mockResolvedValue({ error: null });
    newsletterMock.sendConfirmationEmail.mockResolvedValue(undefined);
  });

  it("stores a pending subscriber and sends a confirmation email", async () => {
    const { POST } = await import("@/app/api/newsletter/subscribe/route");
    const response = await POST(subscribeRequest(" Fan@Example.com "));

    expect(response.status).toBe(200);
    expect(dbMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmation_token: expect.any(String),
        email: "fan@example.com",
        source: "calendar",
        status: "pending",
      }),
      { onConflict: "email" },
    );
    expect(newsletterMock.sendConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmationToken: expect.any(String),
        email: "fan@example.com",
        subscriberId: expect.any(String),
      }),
    );
  });

  it("does not disclose or resend a confirmed address", async () => {
    dbMock.lookupResults.push({
      data: { id: "subscriber-1", status: "confirmed" },
      error: null,
    });
    const { POST } = await import("@/app/api/newsletter/subscribe/route");
    const response = await POST(subscribeRequest("fan@example.com"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(dbMock.upsert).not.toHaveBeenCalled();
    expect(newsletterMock.sendConfirmationEmail).not.toHaveBeenCalled();
  });

  it("rejects invalid email addresses", async () => {
    const { POST } = await import("@/app/api/newsletter/subscribe/route");
    const response = await POST(subscribeRequest("not-an-email"));

    expect(response.status).toBe(400);
    expect(dbMock.upsert).not.toHaveBeenCalled();
  });

  it("rate limits a fourth registration attempt from the same IP", async () => {
    const { POST } = await import("@/app/api/newsletter/subscribe/route");

    for (let index = 0; index < 3; index += 1) {
      await expect(
        POST(subscribeRequest(`fan${index}@example.com`, "203.0.113.10")),
      ).resolves.toHaveProperty("status", 200);
    }

    const response = await POST(
      subscribeRequest("fan4@example.com", "203.0.113.10"),
    );

    expect(response.status).toBe(429);
    expect(newsletterMock.sendConfirmationEmail).toHaveBeenCalledTimes(3);
  });

  it("confirms a fresh pending subscriber while keeping its token", async () => {
    dbMock.lookupResults.push({
      data: {
        created_at: new Date().toISOString(),
        id: "subscriber-1",
        status: "pending",
      },
      error: null,
    });
    const { GET } = await import("@/app/api/newsletter/confirm/route");
    const response = await GET(
      new Request("http://localhost/api/newsletter/confirm?token=token-1"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/newsletter/confirmed?completed=1",
    );
    expect(dbMock.update).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmed_at: expect.any(String),
        status: "confirmed",
      }),
    );
    expect(dbMock.update.mock.calls[0]?.[0]).not.toHaveProperty(
      "confirmation_token",
    );
  });

  it("routes a second visit to a confirmed link as already confirmed", async () => {
    dbMock.statefulSubscriber = {
      confirmationToken: "token-1",
      created_at: new Date().toISOString(),
      id: "subscriber-1",
      status: "pending",
    };
    const { GET } = await import("@/app/api/newsletter/confirm/route");
    const request = new Request(
      "http://localhost/api/newsletter/confirm?token=token-1",
    );

    const firstResponse = await GET(request);
    const secondResponse = await GET(request);

    expect(firstResponse.headers.get("location")).toBe(
      "http://localhost/newsletter/confirmed?completed=1",
    );
    expect(secondResponse.headers.get("location")).toBe(
      "http://localhost/newsletter/already-confirmed",
    );
    expect(dbMock.statefulSubscriber).toMatchObject({
      confirmationToken: "token-1",
      status: "confirmed",
    });
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("does not confirm an expired token", async () => {
    dbMock.lookupResults.push({
      data: {
        created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        id: "subscriber-1",
        status: "pending",
      },
      error: null,
    });
    const { GET } = await import("@/app/api/newsletter/confirm/route");
    const response = await GET(
      new Request("http://localhost/api/newsletter/confirm?token=expired"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/newsletter/expired",
    );
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("routes an already confirmed token without updating it", async () => {
    dbMock.lookupResults.push({ data: { created_at: new Date().toISOString(), id: "subscriber-1", status: "confirmed" }, error: null });
    const { GET } = await import("@/app/api/newsletter/confirm/route");
    const response = await GET(new Request("http://localhost/api/newsletter/confirm?token=confirmed"));
    expect(response.headers.get("location")).toBe("http://localhost/newsletter/already-confirmed");
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("routes confirmation update failures to a server-error page", async () => {
    dbMock.lookupResults.push({ data: { created_at: new Date().toISOString(), id: "subscriber-1", status: "pending" }, error: null });
    dbMock.updateError = { message: "database unavailable" };
    const { GET } = await import("@/app/api/newsletter/confirm/route");
    const response = await GET(new Request("http://localhost/api/newsletter/confirm?token=pending"));
    expect(response.headers.get("location")).toBe("http://localhost/newsletter/confirmation-error");
  });

  it("does not resubscribe an unsubscribed token", async () => {
    dbMock.lookupResults.push({ data: { created_at: new Date().toISOString(), id: "subscriber-1", status: "unsubscribed" }, error: null });
    const { GET } = await import("@/app/api/newsletter/confirm/route");
    const response = await GET(new Request("http://localhost/api/newsletter/confirm?token=unsubscribed"));
    expect(response.headers.get("location")).toBe("http://localhost/newsletter/unsubscribed-link");
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("unsubscribes without authentication", async () => {
    dbMock.lookupResults.push({ data: { id: "subscriber-1" }, error: null });
    const { GET } = await import("@/app/api/newsletter/unsubscribe/route");
    const response = await GET(
      new Request("http://localhost/api/newsletter/unsubscribe?token=subscriber-1"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost/newsletter/unsubscribed",
    );
    expect(dbMock.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "unsubscribed" }),
    );
  });
});
