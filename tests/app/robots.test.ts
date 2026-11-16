import { describe, expect, it } from "vitest";

import robots from "@/app/robots";

function disallowedPaths(): string[] {
  const rules = robots().rules;
  if (!rules || Array.isArray(rules) || !Array.isArray(rules.disallow)) {
    throw new Error("Expected a single rules object with a disallow array");
  }
  return rules.disallow;
}

describe("robots user-specific API exclusions", () => {
  it("disallows exactly the specified prefixes in the specified order", () => {
    expect(disallowedPaths()).toEqual([
      "/ops",
      "/api/me/",
      "/api/matches/",
      "/api/home/",
      "/api/user/",
      "/api/chat/",
    ]);
  });

  it.each(["/api/og/", "/api/og/matches/example.png"])(
    "keeps OG images crawlable at %s",
    (path) => {
      expect(
        disallowedPaths().filter((prefix) => path.startsWith(prefix)),
      ).toEqual([]);
    },
  );

  it("preserves the allow rule, user agent and sitemap URL", () => {
    expect(robots()).toMatchObject({
      rules: { allow: "/", userAgent: "*" },
      sitemap: "https://www.trylinerugby.com/sitemap.xml",
    });
  });
});
