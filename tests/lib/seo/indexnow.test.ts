import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadIndexNow(siteUrl = "https://www.trylinerugby.com") {
  vi.resetModules();
  vi.doMock("@/lib/site", () => ({ SITE_URL: siteUrl }));

  return import("@/lib/seo/indexnow");
}

describe("submitUrlsToIndexNow", () => {
  beforeEach(() => {
    process.env.INDEXNOW_KEY = "";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    process.env.INDEXNOW_KEY = "";
    vi.doUnmock("@/lib/site");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("skips when INDEXNOW_KEY is not configured", async () => {
    const { submitUrlsToIndexNow } = await loadIndexNow();

    await submitUrlsToIndexNow(["https://www.trylinerugby.com/matches/1"]);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips outside the production host", async () => {
    process.env.INDEXNOW_KEY = "test-key";
    const { submitUrlsToIndexNow } = await loadIndexNow(
      "http://localhost:3000",
    );

    await submitUrlsToIndexNow(["http://localhost:3000/matches/1"]);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts urls to the IndexNow endpoint", async () => {
    process.env.INDEXNOW_KEY = "test-key";
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => "",
    } as Response);
    const { submitUrlsToIndexNow } = await loadIndexNow();

    await submitUrlsToIndexNow(["https://www.trylinerugby.com/matches/1"]);

    expect(fetch).toHaveBeenCalledWith(
      "https://api.indexnow.org/indexnow",
      expect.objectContaining({
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
    const request = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit;

    expect(JSON.parse(String(request.body))).toEqual({
      host: "www.trylinerugby.com",
      key: "test-key",
      keyLocation: "https://www.trylinerugby.com/test-key.txt",
      urlList: ["https://www.trylinerugby.com/matches/1"],
    });
  });

  it("does not throw when IndexNow returns an error", async () => {
    process.env.INDEXNOW_KEY = "test-key";
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "server error",
    } as Response);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { submitUrlsToIndexNow } = await loadIndexNow();

    await expect(
      submitUrlsToIndexNow(["https://www.trylinerugby.com/matches/1"]),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
  });
});
