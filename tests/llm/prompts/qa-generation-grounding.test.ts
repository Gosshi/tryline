import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  QA_EXCLUDED_GENERATION_FIELDS,
  QA_GROUNDED_ASSEMBLED_FIELDS,
} from "@/lib/llm/prompts/qa-content";

const generationPromptPaths = [
  "lib/llm/prompts/generate-preview.ts",
  "lib/llm/prompts/generate-recap.ts",
];

describe("generation and QA grounding fields", () => {
  it("requires each assembled field referenced by generation to be grounded or explicitly excluded", () => {
    const referencedFields = new Set(
      generationPromptPaths.flatMap((path) => {
        const source = readFileSync(resolve(process.cwd(), path), "utf8");

        return Array.from(source.matchAll(/assembled\.([a-z_]+)/g)).flatMap(
          (match) => (match[1] ? [match[1]] : []),
        );
      }),
    );
    const reviewedFields = new Set<string>([
      ...QA_GROUNDED_ASSEMBLED_FIELDS,
      ...QA_EXCLUDED_GENERATION_FIELDS,
    ]);

    expect(
      [...referencedFields].filter((field) => !reviewedFields.has(field)),
    ).toEqual([]);
    expect(QA_GROUNDED_ASSEMBLED_FIELDS).toContain("projected_lineups");
    expect(QA_GROUNDED_ASSEMBLED_FIELDS).toContain("match_events");
  });
});
