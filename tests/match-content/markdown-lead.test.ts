import { describe, expect, it } from "vitest";

import { parseMarkdown, selectMatchLead } from "@/lib/match-content/markdown";

describe("selectMatchLead", () => {
  it.each([
    ["paragraph", "核心の文。"],
    ["blockquote", "> 核心の文。"],
  ])(
    "selects the immediate %s, including its index and text",
    (_type, markdown) => {
      expect(
        selectMatchLead(
          parseMarkdown(
            `# この試合の核心\n\n${markdown}\n\n# 次の見出し\n\n次の段落。`,
          ),
        ),
      ).toEqual({
        headingIndex: 0,
        lead: { index: 1, text: "核心の文。" },
      });
    },
  );

  it.each([
    ["list", "- 一覧"],
    ["ordered list", "1. 一覧"],
    ["table", "| 列 |\n| --- |\n| 値 |"],
    ["heading", "# 次の見出し"],
  ])("does not search for a later paragraph after a %s", (_type, markdown) => {
    expect(
      selectMatchLead(parseMarkdown(`# 核心\n\n${markdown}\n\n後の段落。`)),
    ).toEqual({ headingIndex: 0, lead: null });
  });

  it.each(["冒頭文。", "> 冒頭文。"])(
    "selects only the first text block without a heading: %s",
    (markdown) => {
      expect(
        selectMatchLead(parseMarkdown(`${markdown}\n\n後の段落。`)),
      ).toEqual({ headingIndex: null, lead: { index: 0, text: "冒頭文。" } });
    },
  );

  it.each(["- 一覧", "1. 一覧", "| 列 |\n| --- |\n| 値 |"])(
    "does not search beyond the first block without a heading: %s",
    (markdown) => {
      expect(
        selectMatchLead(parseMarkdown(`${markdown}\n\n後の段落。`)),
      ).toEqual({ headingIndex: null, lead: null });
    },
  );

  it("uses the first heading regardless of its wording and leaves preamble blocks alone", () => {
    expect(
      selectMatchLead(
        parseMarkdown(
          "Before heading\n\n## Match focus\n\n> English lead\n\n# この試合の核心\n\n別の段落",
        ),
      ),
    ).toEqual({ headingIndex: 1, lead: { index: 2, text: "English lead" } });
  });

  it("has no lead when the heading is the final block", () => {
    expect(selectMatchLead(parseMarkdown("# 核心"))).toEqual({
      headingIndex: 0,
      lead: null,
    });
  });

  it("returns no heading or lead for empty content", () => {
    expect(selectMatchLead([])).toEqual({ headingIndex: null, lead: null });
  });
});
