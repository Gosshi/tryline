import { describe, expect, it } from "vitest";

import { CONTENT_LENGTH_ISSUE } from "@/lib/llm/content-length";
import { filterLlmLengthIssues } from "@/lib/llm/stages/qa";

describe("filterLlmLengthIssues", () => {
  it("removes LLM length claims so the deterministic guard remains authoritative", () => {
    expect(
      filterLlmLengthIssues([
        "本文は1500字以上で、字数要件を満たしています",
        "戦術分析が具体性に欠けます",
        CONTENT_LENGTH_ISSUE,
      ]),
    ).toEqual(["戦術分析が具体性に欠けます"]);
  });
});
