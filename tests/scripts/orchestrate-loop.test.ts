import { describe, expect, it, vi } from "vitest";

import { runOrchestrateLoop } from "../../scripts/orchestrate-loop.mjs";

function response(
  remaining: { previews: number; recaps: number } | undefined,
  status = 200,
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => remaining === undefined ? {} : { remaining },
  };
}

describe("runOrchestrateLoop", () => {
  it("stops after one response when nothing remains", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ previews: 0, recaps: 0 }));

    const result = await runOrchestrateLoop({
      authorization: "secret",
      fetchImpl,
      targetUrl: "https://example.test",
    });

    expect(result.attempts).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.test/api/cron/orchestrate",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("repeats while remaining work exists, up to four calls", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ previews: 1, recaps: 2 }))
      .mockResolvedValueOnce(response({ previews: 0, recaps: 1 }))
      .mockResolvedValueOnce(response({ previews: 0, recaps: 0 }));

    const result = await runOrchestrateLoop({
      authorization: "secret",
      fetchImpl,
      targetUrl: "https://example.test",
    });

    expect(result.attempts).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("stops after four responses if work remains", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ previews: 0, recaps: 1 }));

    const result = await runOrchestrateLoop({
      authorization: "secret",
      fetchImpl,
      targetUrl: "https://example.test",
    });

    expect(result.attempts).toBe(4);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("fails when remaining is missing or invalid", async () => {
    await expect(
      runOrchestrateLoop({
        authorization: "secret",
        fetchImpl: vi.fn().mockResolvedValue(response(undefined)),
        targetUrl: "https://example.test",
      }),
    ).rejects.toThrow("missing a valid remaining count");
  });

  it("fails immediately on an HTTP error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(undefined, 504));

    await expect(
      runOrchestrateLoop({
        authorization: "secret",
        fetchImpl,
        targetUrl: "https://example.test",
      }),
    ).rejects.toThrow("HTTP 504");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
