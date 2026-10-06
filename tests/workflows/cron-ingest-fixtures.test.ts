import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("weekly fixture ingestion", () => {
  it("keeps the default call and runs RWC 2027 even after a failure", () => {
    const workflow = readFileSync(
      ".github/workflows/cron-ingest-fixtures.yml",
      "utf8",
    );
    const steps = workflow.split("      - name:").slice(1);

    expect(steps).toHaveLength(2);
    expect(steps[0]).toContain("curl -f -X POST");
    expect(steps[0]).not.toContain("-d ");
    expect(steps[1]).toContain("if: always()");
    expect(steps[1]).toContain("curl -f -X POST");
    expect(steps[1]).toContain('-H "Content-Type: application/json"');
    expect(steps[1]).toContain(`-d '{"competition":"rwc-2027"}'`);
    expect(workflow).not.toContain("continue-on-error");
    expect(workflow).not.toContain("|| true");
  });
});
