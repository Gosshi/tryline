import { afterEach, describe, expect, it, vi } from "vitest";

async function loadBuilder(siteUrl: string) {
  vi.resetModules();
  vi.doMock("@/lib/site", () => ({ SITE_URL: siteUrl }));
  const matchUrlModule = await import("@/lib/x/match-url");
  return matchUrlModule.buildMatchShareUrl;
}

function expectUtm(
  urlString: string,
  expected: {
    campaign: "preview" | "recap";
    content: string;
    source: "discord" | "x";
  },
) {
  const url = new URL(urlString);

  expect(url.searchParams.get("utm_source")).toBe(expected.source);
  expect(url.searchParams.get("utm_medium")).toBe("social");
  expect(url.searchParams.get("utm_campaign")).toBe(expected.campaign);
  expect(url.searchParams.get("utm_content")).toBe(expected.content);
}

describe("buildMatchShareUrl", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/site");
  });

  it("builds Japanese recap share URLs with UTM parameters", async () => {
    const buildMatchShareUrl = await loadBuilder(
      "https://www.trylinerugby.com",
    );
    const urlString = buildMatchShareUrl("match-1", {
      contentType: "recap",
      language: "ja",
      source: "x",
    });
    const url = new URL(urlString);

    expect(url.origin).toBe("https://www.trylinerugby.com");
    expect(url.pathname).toBe("/matches/match-1");
    expectUtm(urlString, {
      campaign: "recap",
      content: "match-1",
      source: "x",
    });
  });

  it("builds English preview share URLs with UTM parameters", async () => {
    const buildMatchShareUrl = await loadBuilder(
      "https://www.trylinerugby.com",
    );
    const urlString = buildMatchShareUrl("match-2", {
      contentType: "preview",
      language: "en",
      source: "x",
    });
    const url = new URL(urlString);

    expect(url.pathname).toBe("/matches/match-2/en");
    expectUtm(urlString, {
      campaign: "preview",
      content: "match-2",
      source: "x",
    });
  });

  it("builds Japanese preview and English recap variants", async () => {
    const buildMatchShareUrl = await loadBuilder(
      "https://www.trylinerugby.com",
    );

    expect(
      new URL(
        buildMatchShareUrl("match-3", {
          contentType: "preview",
          language: "ja",
          source: "x",
        }),
      ).pathname,
    ).toBe("/matches/match-3");
    expect(
      new URL(
        buildMatchShareUrl("match-4", {
          contentType: "recap",
          language: "en",
          source: "x",
        }),
      ).pathname,
    ).toBe("/matches/match-4/en");
  });

  it("uses SITE_URL and avoids double slashes with trailing slash bases", async () => {
    const buildMatchShareUrl = await loadBuilder("https://example.com/base/");
    const urlString = buildMatchShareUrl("match-5", {
      contentType: "recap",
      language: "ja",
      source: "discord",
    });
    const url = new URL(urlString);

    expect(url.origin).toBe("https://example.com");
    expect(url.pathname).toBe("/matches/match-5");
    expect(urlString).not.toContain("//matches");
    expectUtm(urlString, {
      campaign: "recap",
      content: "match-5",
      source: "discord",
    });
  });
});
