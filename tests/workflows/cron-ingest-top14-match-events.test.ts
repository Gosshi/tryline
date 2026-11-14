import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Cron ingest Top 14 match events workflow", () => {
  it("has no schedule while preserving manual dispatch", async () => {
    const workflow = await readFile(
      ".github/workflows/cron-ingest-top14-match-events.yml",
      "utf8",
    );

    expect(workflow).not.toContain("schedule:");
    expect(workflow).toContain("workflow_dispatch:");
  });

  it("prints an API error response before failing the workflow", async () => {
    const workflow = await readFile(
      ".github/workflows/cron-ingest-top14-match-events.yml",
      "utf8",
    );

    expect(workflow).toContain("response_body=$(mktemp)");
    expect(workflow).toContain('cat "$response_body"');
  });
});
