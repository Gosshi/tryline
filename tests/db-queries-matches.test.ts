import { describe, expect, it } from "vitest";

import { stripMarkdown } from "@/lib/db/queries/matches";

describe("stripMarkdown", () => {
  it("removes headings, bullets, and bold markers for recap excerpts", () => {
    const text = `# 試合全体像

- **Bath** が前半で主導権を握った

### ターニングポイント

**後半** は規律で差がついた。`;

    expect(stripMarkdown(text)).toBe(
      `試合全体像
Bath が前半で主導権を握った

ターニングポイント

後半 は規律で差がついた。`,
    );
  });

  it("collapses triple newlines", () => {
    expect(stripMarkdown("本文\n\n\n\n次段落")).toBe("本文\n\n次段落");
  });
});
