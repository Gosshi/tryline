import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Cron ingest Top 14 match events workflow", () => {
  it("runs daily while preserving manual dispatch", async () => {
    const workflow = await readFile(
      ".github/workflows/cron-ingest-top14-match-events.yml",
      "utf8",
    );

    expect(workflow).toContain("schedule:");
    expect(workflow).toContain('- cron: "0 5 * * *"');
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
