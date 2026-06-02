import { describe, expect, it } from "vitest";

import {
  isSampleMatch,
  PRIMARY_SAMPLE_MATCH_ID,
  SAMPLE_MATCH_IDS,
} from "@/lib/sample-matches";

describe("sample matches", () => {
  it("recognizes configured sample match ids", () => {
    expect(SAMPLE_MATCH_IDS).toHaveLength(8);
    expect(SAMPLE_MATCH_IDS[0]).toBe(PRIMARY_SAMPLE_MATCH_ID);
    expect(isSampleMatch(PRIMARY_SAMPLE_MATCH_ID)).toBe(true);
    expect(isSampleMatch(SAMPLE_MATCH_IDS[0]!)).toBe(true);
    expect(isSampleMatch("00000000-0000-0000-0000-000000000000")).toBe(false);
  });
});
