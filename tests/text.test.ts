import { describe, expect, it } from "vitest";

import { truncateAtSentenceBoundary } from "@/lib/text";

describe("truncateAtSentenceBoundary", () => {
  it("returns full text when it is already short", () => {
    expect(truncateAtSentenceBoundary("短い本文です。", 20)).toBe(
      "短い本文です。",
    );
  });

  it("cuts at the last sentence boundary within the limit", () => {
    const text =
      "最初の文です。次の文もここで終わります。さらに後ろに続く本文があります。";

    expect(truncateAtSentenceBoundary(text, 28)).toBe(
      "最初の文です。次の文もここで終わります。",
    );
  });

  it("falls back to an ellipsis when the first sentence is too long", () => {
    const text = `${"あ".repeat(40)}まだ文末が来ません${"い".repeat(40)}`;

    expect(truncateAtSentenceBoundary(text, 30)).toBe(`${text.slice(0, 30)}…`);
  });
});
