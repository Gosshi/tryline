import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Cron ingest Top 14 match events workflow", () => {
  it("leaves scheduled execution commented out while preserving manual dispatch", async () => {
    const workflow = await readFile(
      ".github/workflows/cron-ingest-top14-match-events.yml",
      "utf8",
    );

    expect(workflow).toContain("# schedule:");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toMatch(/^\s{2}schedule:/m);
  });
});
