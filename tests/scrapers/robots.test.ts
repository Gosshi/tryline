import { beforeEach, describe, expect, it, vi } from "vitest";

describe("isAllowed", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.resetModules();
  });

  it("returns false when robots.txt disallows the path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("User-agent: *\nDisallow: /blocked", { status: 200 }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const { isAllowed } = await import("@/lib/scrapers/robots");

    await expect(
      isAllowed(
        "https://robots-deny.example.com/blocked/article",
        "Tryline Test Bot/1.0 (+test@example.com)",
      ),
    ).resolves.toBe(false);
  });

  it("treats a 404 robots.txt response as allowed", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("missing", { status: 404 }));

    vi.stubGlobal("fetch", fetchMock);

    const { isAllowed } = await import("@/lib/scrapers/robots");

    await expect(
      isAllowed(
        "https://robots-404.example.com/allowed",
        "Tryline Test Bot/1.0 (+test@example.com)",
      ),
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith("https://robots-404.example.com/robots.txt", {
      headers: {
        "User-Agent": "Tryline Test Bot/1.0 (+test@example.com)",
      },
    });
  });
});
