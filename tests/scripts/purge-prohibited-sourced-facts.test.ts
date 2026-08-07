import { describe, expect, it, vi } from "vitest";

import {
  isAllowedSourcedFactDomain,
  SOURCED_FACT_ALLOWED_DOMAINS,
} from "@/lib/llm/sourced-facts/allowlist";
import {
  buildSourcedFactPurgePlan,
  parseOptions,
  runSourcedFactPurge,
} from "@/scripts/purge-prohibited-sourced-facts";

import type { Database } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const rows = [
  { id: "fact-1", match_id: "match-1", source_domain: "en.rugby-japan.jp" },
  { id: "fact-2", match_id: "match-1", source_domain: "rugbypass.com" },
  { id: "fact-3", match_id: "match-2", source_domain: "stats.unitedrugby.com" },
  { id: "fact-4", match_id: "match-3", source_domain: "" },
  { id: "fact-5", match_id: "match-4", source_domain: null },
];

function createMockDb(sourcedFactRows = rows) {
  const deleteSelect = vi.fn().mockResolvedValue({
    data: [{ id: "fact-2" }, { id: "fact-4" }, { id: "fact-5" }],
    error: null,
  });
  const deleteIn = vi.fn(() => ({ select: deleteSelect }));
  const deleteMethod = vi.fn(() => ({ in: deleteIn }));
  const select = vi.fn().mockReturnThis();
  const builder = {
    delete: deleteMethod,
    in: deleteIn,
    select,
    then: (
      resolve: (value: { data: typeof sourcedFactRows; error: null }) => unknown,
    ) => Promise.resolve(resolve({ data: sourcedFactRows, error: null })),
  };
  const from = vi.fn(() => builder);

  return {
    db: { from } as unknown as SupabaseClient<Database>,
    deleteIn,
    deleteMethod,
  };
}

describe("purge-prohibited-sourced-facts", () => {
  it("defaults to dry-run and requires explicit Owner approval for deletion", () => {
    expect(parseOptions([])).toEqual({ dryRun: true });
    expect(parseOptions(["--dry-run"])).toEqual({ dryRun: true });
    expect(parseOptions(["--confirm-owner-approved"])).toEqual({
      dryRun: false,
    });
  });

  it("uses the current allowlist, preserves allowed subdomains, and flags blank domains", () => {
    const plan = buildSourcedFactPurgePlan(rows);

    expect(plan).toMatchObject({
      allowedCount: 2,
      disallowedByDomain: {
        "(missing)": 2,
        "rugbypass.com": 1,
      },
      disallowedIds: ["fact-2", "fact-4", "fact-5"],
      matchesWithoutAllowedFacts: 2,
      totalRows: 5,
    });
  });

  it("changes the purge plan when the allowlist changes", () => {
    const plan = buildSourcedFactPurgePlan(
      [{ id: "fact-1", match_id: "match-1", source_domain: "rugbypass.com" }],
      (domain) =>
        isAllowedSourcedFactDomain(domain, [
          ...SOURCED_FACT_ALLOWED_DOMAINS,
          "rugbypass.com",
        ]),
    );

    expect(plan.disallowedIds).toEqual([]);
    expect(plan.allowedCount).toBe(1);
  });

  it("reports per-domain targets without deleting in dry-run mode", async () => {
    const { db, deleteMethod } = createMockDb();
    const logger = { log: vi.fn() };

    const result = await runSourcedFactPurge({ db, logger });

    expect(result.deletedCount).toBe(0);
    expect(result.dryRun).toBe(true);
    expect(logger.log).toHaveBeenCalledWith("  rugbypass.com: 1");
    expect(logger.log).toHaveBeenCalledWith(
      "Matches without allowed sourced facts: 2",
    );
    expect(deleteMethod).not.toHaveBeenCalled();
  });

  it("deletes only disallowed facts after Owner approval", async () => {
    const { db, deleteIn } = createMockDb();

    const result = await runSourcedFactPurge({ db, dryRun: false });

    expect(deleteIn).toHaveBeenCalledWith("id", [
      "fact-2",
      "fact-4",
      "fact-5",
    ]);
    expect(result.deletedCount).toBe(3);
  });

  it("completes successfully when no facts require deletion", async () => {
    const allowedRows = [
      { id: "fact-1", match_id: "match-1", source_domain: "rugby-japan.jp" },
    ];
    const { db, deleteMethod } = createMockDb(allowedRows);

    await expect(
      runSourcedFactPurge({ db, dryRun: false }),
    ).resolves.toMatchObject({ deletedCount: 0, dryRun: false });
    expect(deleteMethod).not.toHaveBeenCalled();
  });
});
