import { describe, expect, it } from "vitest";

import { extractDescription } from "@/lib/match-content/description";

describe("extractDescription", () => {
  it("removes markdown syntax and replaces new lines with spaces", () => {
    const markdown = `# 見出し\n\n**強調** と _斜体_ と [リンク](https://example.com)`;

    expect(extractDescription(markdown)).toBe("見出し 強調 と 斜体 と リンク");
  });

  it("does not append an ellipsis when plain text is 120 chars or fewer", () => {
    const text = "あ".repeat(120);

    expect(extractDescription(text)).toBe(text);
  });

  it("cuts plain text at 120 characters and appends an ellipsis", () => {
    const text = "あ".repeat(121);

    expect(extractDescription(text)).toBe(`${"あ".repeat(120)}…`);
  });
});
