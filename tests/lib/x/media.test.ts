import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchOgImageBuffer, uploadMediaToX } from "@/lib/x/media";

import type { TwitterApi } from "twitter-api-v2";

describe("fetchOgImageBuffer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the result OG image with the expected query parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const buffer = await fetchOgImageBuffer({
      away: "France",
      awayScore: 17,
      competition: "Six Nations",
      home: "Ireland",
      homeScore: 24,
    });

    const url = new URL(fetchMock.mock.calls[0]?.[0] as URL);
    expect(url.origin).toBe("https://www.trylinerugby.com");
    expect(url.pathname).toBe("/api/og");
    expect(url.searchParams.get("type")).toBe("result");
    expect(url.searchParams.get("home")).toBe("Ireland");
    expect(url.searchParams.get("away")).toBe("France");
    expect(url.searchParams.get("hs")).toBe("24");
    expect(url.searchParams.get("as")).toBe("17");
    expect(url.searchParams.get("comp")).toBe("Six Nations");
    expect(buffer).toEqual(Buffer.from([1, 2, 3]));
  });
});

describe("uploadMediaToX", () => {
  it("uploads PNG media through the X v1 client", async () => {
    const uploadMedia = vi.fn().mockResolvedValue("media-1");
    const client = {
      v1: {
        uploadMedia,
      },
    } as unknown as TwitterApi;
    const imageBuffer = Buffer.from([1, 2, 3]);

    await expect(uploadMediaToX(client, imageBuffer, "image/png")).resolves.toBe(
      "media-1",
    );

    expect(uploadMedia).toHaveBeenCalledWith(imageBuffer, {
      mimeType: "image/png",
    });
  });
});