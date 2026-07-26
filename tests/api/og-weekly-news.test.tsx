import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ogMocks = vi.hoisted(() => ({ imageResponse: vi.fn() }));

vi.mock("@vercel/og", () => ({
  ImageResponse: vi.fn((element: unknown, init: unknown) => {
    ogMocks.imageResponse(element, init);
    const headers = new Headers(
      (init as { headers?: HeadersInit } | undefined)?.headers,
    );
    headers.set("content-type", "image/png");
    return new Response("image", { headers, status: 200 });
  }),
}));

function textContent(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textContent).join("");
  }

  return isValidElement(node)
    ? textContent((node.props as { children?: unknown }).children)
    : "";
}

function hasBackground(node: unknown, value: string): boolean {
  if (isValidElement(node)) {
    const props = node.props as {
      children?: unknown;
      style?: Record<string, unknown>;
    };

    return (
      (typeof props.style?.background === "string" &&
        props.style.background.includes(value)) ||
      hasBackground(props.children, value)
    );
  }

  return Array.isArray(node) && node.some((child) => hasBackground(child, value));
}

describe("/api/og weekly news images", () => {
  beforeEach(() => {
    ogMocks.imageResponse.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new Uint8Array([0x4f, 0x54, 0x54, 0x4f]).buffer),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a category-toned, score-free image", async () => {
    const { GET } = await import("@/app/api/og/route");
    const response = await GET(
      new Request(
        "https://tryline.test/api/og?type=weekly-news&category=transfer&item=news-1&orientation=portrait&text=none",
      ),
    );

    const element = ogMocks.imageResponse.mock.calls.at(-1)?.[0];
    expect(response.status).toBe(200);
    expect(ogMocks.imageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ height: 1920, width: 1080 }),
    );
    expect(hasBackground(element, "#F59E0B")).toBe(true);
    expect(textContent(element)).toBe("trylinerugby.com");
    expect(textContent(element)).not.toContain("—");
  });

  it("falls back to the other-category tone for invalid categories", async () => {
    const { GET } = await import("@/app/api/og/route");
    await GET(
      new Request(
        "https://tryline.test/api/og?type=weekly-news&category=unknown&item=news-1&orientation=landscape",
      ),
    );

    const element = ogMocks.imageResponse.mock.calls.at(-1)?.[0];
    expect(ogMocks.imageResponse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ height: 630, width: 1200 }),
    );
    expect(hasBackground(element, "#34D399")).toBe(true);
  });
});
