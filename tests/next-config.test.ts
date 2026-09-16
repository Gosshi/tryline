import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Next build configuration", () => {
  it("defers lint and type checking to CI", async () => {
    const config = await readFile("next.config.ts", "utf8");

    expect(config).toContain("ignoreDuringBuilds: true");
    expect(config).toContain("ignoreBuildErrors: true");
  });
});
