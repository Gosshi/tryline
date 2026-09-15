import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("CI workflow", () => {
  it("validates pull requests and pushes to main", async () => {
    const workflow = await readFile(".github/workflows/ci.yml", "utf8");

    expect(workflow).toMatch(/pull_request:\s+branches:\s+- main/);
    expect(workflow).toMatch(/push:\s+branches:\s+- main/);
  });
});
