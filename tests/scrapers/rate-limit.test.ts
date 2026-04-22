import { beforeEach, describe, expect, it, vi } from "vitest";

describe("acquireSlot", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T00:00:00.000Z"));
    vi.resetModules();
  });

  it("waits for the configured interval between requests to the same domain", async () => {
    const { acquireSlot } = await import("@/lib/scrapers/rate-limit");

    await acquireSlot("example.com", 3_000);

    let released = false;
    const second = acquireSlot("example.com", 3_000).then(() => {
      released = true;
    });

    await vi.advanceTimersByTimeAsync(2_999);
    expect(released).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await second;
    expect(released).toBe(true);
  });
});
