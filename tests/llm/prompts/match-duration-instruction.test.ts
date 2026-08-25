import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("match duration prompt instruction", () => {
  it("defines the text once in the shared block and imports it in both Japanese prompts", () => {
    const sharedSource = readSource("lib/llm/prompts/shared-prompt-blocks.ts");
    const previewSource = readSource("lib/llm/prompts/generate-preview.ts");
    const recapSource = readSource("lib/llm/prompts/generate-recap.ts");

    expect(
      sharedSource.match(/ラグビーユニオンの試合は80分（40分ハーフ）である/g),
    ).toHaveLength(1);
    expect(previewSource).toContain("MATCH_DURATION_INSTRUCTION");
    expect(recapSource).toContain("MATCH_DURATION_INSTRUCTION");
    expect(previewSource).not.toContain("ラグビーユニオンの試合は80分");
    expect(recapSource).not.toContain("ラグビーユニオンの試合は80分");
  });
});
