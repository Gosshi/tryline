import { describe, expect, it } from "vitest";

import {
  extractCoreSection,
  extractDescription,
} from "@/lib/match-content/description";

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

describe("extractCoreSection", () => {
  it("uses the core recap section and excludes following h1 sections", () => {
    const markdown = `# この試合の核心

Franceが終盤に押し切り、32–24で勝ち切った。接点の圧力が差になった。

# MOM

Dupont。`;

    expect(extractCoreSection(markdown)).toBe(
      "Franceが終盤に押し切り、32–24で勝ち切った。接点の圧力が差になった。",
    );
  });

  it("falls back to the generic markdown description when the core heading is missing", () => {
    const markdown = `# ターニングポイント

終盤のPGが勝敗を分けた。`;

    expect(extractCoreSection(markdown)).toBe(
      "ターニングポイント 終盤のPGが勝敗を分けた。",
    );
  });
});