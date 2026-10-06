import { describe, expect, it } from "vitest";

import { resolveRwc2027TeamSlug } from "@/lib/ingestion/sources/wikipedia-rwc";

describe("RWC 2027 Wikipedia team names", () => {
  it.each(["Hong Kong", "Hong Kong China"])(
    "resolves %s to the seeded Hong Kong China team",
    (teamName) => {
      expect(resolveRwc2027TeamSlug(teamName)).toBe("hong-kong-china");
    },
  );
});
