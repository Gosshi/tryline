import { describe, expect, it } from "vitest";

import {
  FetchError,
  RobotsDisallowedError,
  acquireSlot,
  fetchWithPolicy,
  isAllowed,
  saveRawData,
} from "@/lib/scrapers";

describe("scrapers index exports", () => {
  it("re-exports the public scraping helpers", () => {
    expect(fetchWithPolicy).toBeTypeOf("function");
    expect(saveRawData).toBeTypeOf("function");
    expect(isAllowed).toBeTypeOf("function");
    expect(acquireSlot).toBeTypeOf("function");
    expect(FetchError).toBeTypeOf("function");
    expect(RobotsDisallowedError).toBeTypeOf("function");
  });
});
