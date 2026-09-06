import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  containsStatisticalFact,
  STATISTICAL_FACT_PATTERN,
} from "@/lib/llm/sourced-facts/statistical-fact";

type RecapSourcedFactsFixture = {
  facts: Array<{ fact: string }>;
};

const fixture = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "tests/fixtures/recap-sourced-facts-dcd576dd.json"),
    "utf8",
  ),
) as RecapSourcedFactsFixture;
const statisticalFactSource = readFileSync(
  resolve(process.cwd(), "lib/llm/sourced-facts/statistical-fact.ts"),
  "utf8",
);

describe("containsStatisticalFact", () => {
  it("keeps the shared predicate independent from data access and LLM modules", () => {
    expect(statisticalFactSource).not.toMatch(/^import /m);
    expect(statisticalFactSource).not.toContain("getSupabaseServerClient");
    expect(statisticalFactSource).not.toContain("createWebSearchJsonResponse");
    expect(statisticalFactSource).not.toContain("fetchJrfuMatchLineup");
  });

  it("recognizes the Japanese lineout and scrum statistics in the recap fixture", () => {
    const fact = fixture.facts.find((entry) =>
      entry.fact.includes("ラインアウトはSouth Africaが11/11"),
    );

    expect(fact).toBeDefined();
    expect(containsStatisticalFact(fact?.fact ?? "")).toBe(true);
  });

  it("recognizes Japanese percentage, count, and ratio statistics", () => {
    expect(containsStatisticalFact("ポゼッションは57%だった。")).toBe(true);
    expect(containsStatisticalFact("反則は11対12だった。")).toBe(true);
    expect(containsStatisticalFact("タックルは150回だった。")).toBe(true);
  });

  it("does not classify penalty tries or penalty goals as statistics", () => {
    expect(
      containsStatisticalFact(
        "South Africa tries: penalty try (36'), Jesse Kriel (58').",
      ),
    ).toBe(false);
    expect(containsStatisticalFact("36分にペナルティトライを得た。")).toBe(
      false,
    );
    expect(containsStatisticalFact("ペナルティゴールで加点した。")).toBe(false);
  });

  it("continues to recognize penalty counts", () => {
    expect(
      containsStatisticalFact("Kobe Steelers conceded nine penalties."),
    ).toBe(true);
  });

  it("uses only the case-insensitive flag", () => {
    expect(STATISTICAL_FACT_PATTERN.flags).toBe("i");
  });
});
