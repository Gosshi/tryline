import { describe, expect, it } from "vitest";

import { isUuid } from "@/lib/ids";

describe("isUuid", () => {
  it.each([
    ["1e74662b-af45-4ef1-b267-156eb87329d5", true],
    ["1E74662B-AF45-4EF1-B267-156EB87329D5", true],
    ["00000000-0000-0000-0000-000000000000", true],
    ["ffffffff-ffff-ffff-ffff-ffffffffffff", true],
    ["abc", false],
    ["1e74662b-af45-4ef1-b267-156eb87329d", false],
    ["1e74662baf454ef1b267156eb87329d5", false],
    [" 1e74662b-af45-4ef1-b267-156eb87329d5", false],
    ["1e74662b-af45-4ef1-b267-156eb87329d5 ", false],
    ["1e74662b-af45-4ef1-b267-156eb87329d5\n", false],
    ["ge74662b-af45-4ef1-b267-156eb87329d5", false],
    ["", false],
  ])("validates %j as %s", (value, expected) => {
    expect(isUuid(value)).toBe(expected);
  });
});
