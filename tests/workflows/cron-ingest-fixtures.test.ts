import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/cron-ingest-fixtures.yml",
  "utf8",
);
const steps = workflow.split("      - name:").slice(1);

describe("weekly fixture ingestion", () => {
  it("keeps both calls, defaults to writing and runs RWC even after a failure", () => {
    expect(steps).toHaveLength(2);
    expect(workflow).toMatch(
      /dry_run:[\s\S]*type: boolean[\s\S]*default: false/,
    );
    expect(workflow).toContain("DRY_RUN: ${{ inputs.dry_run || false }}");
    expect(steps[1]).toContain("if: always()");
    for (const step of steps) expect(step).toContain("curl -f -X POST");
    expect(workflow).not.toContain("continue-on-error");
    expect(workflow).not.toContain("|| true");
  });

  it.each([false, true])(
    "sends dryRun=true to both calls only when requested (%s), and logs JSON",
    (dryRun) => {
      for (const [index, step] of steps.entries()) {
        const script = step
          .split("        run: |\n")[1]!
          .replace("${{ secrets.CRON_SECRET }}", "test-placeholder");
        // Execute the real shell payload logic with a curl stub: no network call.
        const output = execFileSync(
          "/bin/bash",
          [
            "-c",
            `
        curl() {
          while [ "$#" -gt 0 ]; do
            if [ "$1" = "-d" ]; then printf '%s\n' "$2"; return; fi
            shift
          done
          return 1
        }
        ${script}
      `,
          ],
          { env: { NODE_ENV: "test", DRY_RUN: String(dryRun) }, encoding: "utf8" },
        );
        expect(JSON.parse(output)).toEqual({
          competition: index === 0 ? "six-nations-2027" : "rwc-2027",
          ...(dryRun ? { dryRun: true } : {}),
        });
      }
    },
  );
});
