import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  logSourcedFactDuplicateAudit,
  summarizeSourcedFactDuplicates,
} from "@/tools/audit-sourced-fact-duplicates";

describe("audit-sourced-fact-duplicates", () => {
  it("reports per-match counts and duplicate source-domain groups", () => {
    const audit = summarizeSourcedFactDuplicates([
      {
        content_type: "preview",
        match_id: "match-1",
        source_domain: "rugby.com.au",
      },
      {
        content_type: "preview",
        match_id: "match-1",
        source_domain: "rugby.com.au",
      },
      {
        content_type: "preview",
        match_id: "match-1",
        source_domain: "springboks.rugby",
      },
      {
        content_type: "recap",
        match_id: "match-1",
        source_domain: "rugby.com.au",
      },
    ]);

    expect(audit.totalFacts).toBe(4);
    expect(audit.byMatchAndContentType).toContainEqual({
      contentType: "preview",
      factCount: 3,
      matchId: "match-1",
    });
    expect(audit.duplicateSourceGroups).toEqual([
      {
        contentType: "preview",
        factCount: 2,
        matchId: "match-1",
        sourceDomain: "rugby.com.au",
      },
    ]);
  });

  it("contains no write SQL or mutation client methods", () => {
    const source = readFileSync(
      "tools/audit-sourced-fact-duplicates.ts",
      "utf8",
    );

    expect(source).toContain(
      '.select("match_id, content_type, source_domain")',
    );
    expect(source).not.toMatch(/\.(?:delete|insert|update|upsert)\s*\(/);
    expect(source).not.toMatch(/\b(?:delete|insert|update|drop|truncate)\b/i);
  });

  it("prints the duplicate report without mutating it", () => {
    const log = vi.fn();
    const audit = summarizeSourcedFactDuplicates([
      {
        content_type: "preview",
        match_id: "match-1",
        source_domain: "rugby.com.au",
      },
      {
        content_type: "preview",
        match_id: "match-1",
        source_domain: "rugby.com.au",
      },
    ]);

    logSourcedFactDuplicateAudit(audit, { log });

    expect(log).toHaveBeenCalledWith("Sourced facts: total=2");
    expect(log).toHaveBeenCalledWith("  match-1 preview rugby.com.au: 2");
  });
});
