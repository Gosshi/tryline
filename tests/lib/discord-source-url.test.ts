import { afterEach, describe, expect, it, vi } from "vitest";

import { validateSourceUrl } from "@/lib/discord/source-url";

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
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it("falls back to GET when HEAD is not allowed", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 405 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

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
    });
  });
});
