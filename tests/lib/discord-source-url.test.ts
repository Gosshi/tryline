import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OWNER_VERIFIABLE_SOURCE_URL_STATUSES,
  validateSourceUrl,
} from "@/lib/discord/source-url";

function asFetchImplementation(
  implementation: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
) {
  return implementation as typeof fetch;
}

describe("validateSourceUrl", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts a final 200 response without reading its body", async () => {
    const text = vi.fn();
    const fetchImplementation = vi.fn(
      async () => ({ status: 200, text }) as unknown as Response,
    );

    await expect(
      validateSourceUrl("https://example.com/story", {
        fetchImplementation: asFetchImplementation(fetchImplementation),
      }),
    ).resolves.toEqual({ ok: true, sourceDomain: "example.com" });
    expect(fetchImplementation).toHaveBeenCalledWith(
      new URL("https://example.com/story"),
      expect.objectContaining({ method: "HEAD", redirect: "follow" }),
    );
    expect(text).not.toHaveBeenCalled();
  });

  it("rejects a 404 response without trying GET", async () => {
    const fetchImplementation = vi.fn(
      async () => new Response(null, { status: 404 }),
    );

    await expect(
      validateSourceUrl("https://example.com/missing", {
        fetchImplementation: asFetchImplementation(fetchImplementation),
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "出典 URL が HTTP 404 を返しました。",
      status: 404,
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("returns a 429 status without trying GET", async () => {
    const fetchImplementation = vi.fn(
      async () => new Response(null, { status: 429 }),
    );

    await expect(
      validateSourceUrl("https://example.com/rate-limited", {
        fetchImplementation: asFetchImplementation(fetchImplementation),
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "出典 URL が HTTP 429 を返しました。",
      status: 429,
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("returns a 401 status without trying GET", async () => {
    const fetchImplementation = vi.fn(
      async () => new Response(null, { status: 401 }),
    );

    await expect(
      validateSourceUrl("https://example.com/subscriber-only", {
        fetchImplementation: asFetchImplementation(fetchImplementation),
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "出典 URL が HTTP 401 を返しました。",
      status: 401,
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("falls back to GET when HEAD is not allowed", async () => {
    const cancel = vi.fn(async () => undefined);
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce({
        body: { cancel },
        status: 200,
      } as unknown as Response);

    await expect(
      validateSourceUrl("https://example.com/story", {
        fetchImplementation: asFetchImplementation(fetchImplementation),
      }),
    ).resolves.toEqual({ ok: true, sourceDomain: "example.com" });
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      new URL("https://example.com/story"),
      expect.objectContaining({ method: "HEAD", redirect: "follow" }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      new URL("https://example.com/story"),
      expect.objectContaining({ method: "GET", redirect: "follow" }),
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("returns the final GET status after a HEAD fallback", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));

    await expect(
      validateSourceUrl("https://example.com/story", {
        fetchImplementation: asFetchImplementation(fetchImplementation),
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "出典 URL が HTTP 403 を返しました。",
      status: 403,
    });
  });

  it("rejects non-http schemes without making a request", async () => {
    const fetchImplementation = vi.fn();

    await expect(
      validateSourceUrl("javascript:alert(1)", {
        fetchImplementation: asFetchImplementation(fetchImplementation),
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "出典 URL は http または https で指定してください。",
      status: null,
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("rejects a request that exceeds the timeout", async () => {
    vi.useFakeTimers();
    const fetchImplementation = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const validation = validateSourceUrl("https://example.com/slow", {
      fetchImplementation: asFetchImplementation(fetchImplementation),
      timeoutMs: 25,
    });
    await vi.advanceTimersByTimeAsync(25);

    await expect(validation).resolves.toEqual({
      ok: false,
      reason: "出典 URL の確認が 0.025 秒でタイムアウトしました。",
      status: null,
    });
  });

  it("reports connection failures separately", async () => {
    const fetchImplementation = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(
      validateSourceUrl("https://example.com/unreachable", {
        fetchImplementation: asFetchImplementation(fetchImplementation),
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "出典 URL に接続できませんでした。",
      status: null,
    });
  });

  it("limits owner-verifiable statuses to bot and subscription rejections", () => {
    expect(OWNER_VERIFIABLE_SOURCE_URL_STATUSES).toEqual(
      new Set([401, 403, 429]),
    );
    expect(OWNER_VERIFIABLE_SOURCE_URL_STATUSES.has(404)).toBe(false);
    expect(OWNER_VERIFIABLE_SOURCE_URL_STATUSES.has(500)).toBe(false);
  });
});
