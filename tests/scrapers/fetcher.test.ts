import { beforeEach, describe, expect, it, vi } from "vitest";

const robotsMock = vi.hoisted(() => ({
  isAllowed: vi.fn(),
}));

const rateLimitMock = vi.hoisted(() => ({
  acquireSlot: vi.fn(),
}));

vi.mock("@/lib/scrapers/robots", () => robotsMock);
vi.mock("@/lib/scrapers/rate-limit", () => rateLimitMock);

describe("fetchWithPolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();

    process.env.NEXT_PUBLIC_SUPABASE_URL = "";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.SCRAPER_USER_AGENT = "Tryline Test Bot/1.0 (+test@example.com)";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "";
    process.env.CRON_SECRET = "test-cron-secret";

    robotsMock.isAllowed.mockResolvedValue(true);
    rateLimitMock.acquireSlot.mockResolvedValue(undefined);
  });

  it("throws RobotsDisallowedError before sending the request when robots disallows the URL", async () => {
    robotsMock.isAllowed.mockResolvedValue(false);
    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);

    const { fetchWithPolicy, RobotsDisallowedError } =
      await import("@/lib/scrapers");

    await expect(
      fetchWithPolicy("https://example.com/blocked"),
    ).rejects.toBeInstanceOf(RobotsDisallowedError);

    expect(rateLimitMock.acquireSlot).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks robots, waits for a slot, then fetches and injects the User-Agent header", async () => {
    const events: string[] = [];
    const response = new Response("ok", { status: 200 });
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
      events.push("fetch");
      expect(init?.headers).toBeInstanceOf(Headers);
      expect(new Headers(init?.headers).get("User-Agent")).toBe(
        process.env.SCRAPER_USER_AGENT,
      );

      return response;
    });

    robotsMock.isAllowed.mockImplementation(async () => {
      events.push("robots");

      return true;
    });
    rateLimitMock.acquireSlot.mockImplementation(async () => {
      events.push("slot");
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchWithPolicy } = await import("@/lib/scrapers");
    const result = await fetchWithPolicy("https://example.com/article");

    expect(result).toBe(response);
    expect(events).toEqual(["robots", "slot", "fetch"]);
    expect(robotsMock.isAllowed).toHaveBeenCalledWith(
      "https://example.com/article",
      process.env.SCRAPER_USER_AGENT,
    );
    expect(rateLimitMock.acquireSlot).toHaveBeenCalledWith(
      "example.com",
      3_000,
    );
  });

  it("retries 5xx responses with exponential backoff and throws FetchError after exceeding max retries", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("first", { status: 503 }))
      .mockResolvedValueOnce(new Response("second", { status: 502 }))
      .mockResolvedValueOnce(new Response("third", { status: 500 }));

    vi.stubGlobal("fetch", fetchMock);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { FetchError, fetchWithPolicy } = await import("@/lib/scrapers");
    const request = fetchWithPolicy("https://example.com/failure", {
      maxRetries: 2,
    });
    const rejection = expect(request).rejects.toEqual(
      expect.objectContaining<Partial<InstanceType<typeof FetchError>>>({
        attempt: 3,
        status: 500,
        url: "https://example.com/failure",
      }),
    );

    await vi.runAllTimersAsync();
    await rejection;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(rateLimitMock.acquireSlot).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("1000ms");
    expect(warnSpy.mock.calls[1]?.[0]).toContain("2000ms");
  });

  it("does not retry 4xx responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("missing", { status: 404 }));

    vi.stubGlobal("fetch", fetchMock);

    const { FetchError, fetchWithPolicy } = await import("@/lib/scrapers");

    await expect(
      fetchWithPolicy("https://example.com/not-found"),
    ).rejects.toBeInstanceOf(FetchError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rateLimitMock.acquireSlot).toHaveBeenCalledTimes(1);
  });

  it("respects Retry-After for 429 responses", async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("slow down", {
          headers: {
            "Retry-After": "7",
          },
          status: 429,
        }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { fetchWithPolicy } = await import("@/lib/scrapers");
    const request = fetchWithPolicy("https://example.com/retry-after", {
      maxRetries: 1,
    });

    await vi.advanceTimersByTimeAsync(6_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);

    await expect(request).resolves.toBeInstanceOf(Response);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
