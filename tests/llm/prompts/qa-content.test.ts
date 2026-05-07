import { describe, expect, it } from "vitest";

import {
  buildQaContentPrompt,
  PROMPT_VERSION,
} from "@/lib/llm/prompts/qa-content";

describe("buildQaContentPrompt", () => {
  it("uses qa prompt version 1.2.0", () => {
    expect(PROMPT_VERSION).toBe("qa@1.2.0");
  });

  it("uses preview length thresholds in the information density rubric", () => {
    const prompt = buildQaContentPrompt("preview", "本文");

    expect(prompt).toContain("### information_density (1-5)");
    expect(prompt).toContain("- 5: 1500字以上");
    expect(prompt).toContain("- 4: 1500字以上");
    expect(prompt).toContain("- 3: 1125字以上");
    expect(prompt).toContain("- 2: 750字未満");
    expect(prompt).toContain("verdict判定: いずれか2以下なら retry");
  });

  it("uses recap length thresholds in the information density rubric", () => {
    const prompt = buildQaContentPrompt("recap", "本文");

    expect(prompt).toContain("- 5: 2000字以上");
    expect(prompt).toContain("- 4: 2000字以上");
    expect(prompt).toContain("- 3: 1500字以上");
    expect(prompt).toContain("- 2: 1000字未満");
  });

  it("adds winner consistency checks only for recaps", () => {
    const recapPrompt = buildQaContentPrompt("recap", "本文");
    const previewPrompt = buildQaContentPrompt("preview", "本文");

    expect(recapPrompt).toContain("## 勝者整合性チェック");
    expect(recapPrompt).toContain("home_score と away_score");
    expect(recapPrompt).toContain("factual_grounding を 1");
    expect(previewPrompt).not.toContain("## 勝者整合性チェック");
  });
});
