import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ogMocks = vi.hoisted(() => ({
  imageResponse: vi.fn(),
}));

vi.mock("@vercel/og", () => ({
  ImageResponse: vi.fn((element: unknown, init: unknown) => {
    ogMocks.imageResponse(element, init);
    return new Response("image", {
      headers: { "content-type": "image/png" },
      status: 200,
    });
  }),
}));

describe("/api/og competition images", () => {
  beforeEach(() => {
    ogMocks.imageResponse.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(new Uint8Array([0x4f, 0x54, 0x54, 0x4f]).buffer),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a 1200x630 competition OG image", async () => {
    const { GET } = await import("@/app/api/og/route");

    const response = await GET(
      new Request(
        "https://tryline.test/api/og?type=competition&family_name=Pacific+Nations+Cup&accent=%23c93a3a&season=2026",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/png");
    expect(ogMocks.imageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ height: 630, width: 1200 }),
    );
  });

  it("keeps result OG images on the existing 1200x675 path", async () => {
    const { GET } = await import("@/app/api/og/route");

    await GET(
      new Request(
        "https://tryline.test/api/og?type=result&home=Home&away=Away&hs=20&as=10",
      ),
    );

    expect(ogMocks.imageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ height: 675, width: 1200 }),
    );
  });
});
