import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260716010000_add_team_flag_code.sql",
  ),
  "utf8",
);

const englandSlugs = [
  "england",
  "bath",
  "bristol-bears",
  "exeter-chiefs",
  "gloucester",
  "harlequins",
  "leicester-tigers",
  "newcastle-falcons",
  "northampton-saints",
  "sale-sharks",
  "saracens",
];

const walesSlugs = ["wales", "cardiff", "dragons", "ospreys", "scarlets"];
const scotlandSlugs = ["scotland", "edinburgh", "glasgow-warriors"];

describe("team flag identity migration", () => {
  it("adds the nullable flag_code column", () => {
    expect(migration).toContain("add column if not exists flag_code text");
  });

  it("does not derive a single default flag from country GBR", () => {
    expect(migration).not.toContain("('GBR'");
  });

  it("maps all known GBR teams to England, Wales, or Scotland regional flags", () => {
    for (const slug of englandSlugs) {
      expect(migration).toContain(`'${slug}'`);
    }

    for (const slug of walesSlugs) {
      expect(migration).toContain(`'${slug}'`);
    }

    for (const slug of scotlandSlugs) {
      expect(migration).toContain(`'${slug}'`);
    }

    expect(migration).toContain("set flag_code = '🏴󠁧󠁢󠁥󠁮󠁧󠁿'");
    expect(migration).toContain("set flag_code = '🏴󠁧󠁢󠁷󠁬󠁳󠁿'");
    expect(migration).toContain("set flag_code = '🏴󠁧󠁢󠁳󠁣󠁴󠁿'");
    expect([
      ...englandSlugs,
      ...walesSlugs,
      ...scotlandSlugs,
    ]).toHaveLength(19);
  });

  it("maps non-GBR country values to stored flag emoji values", () => {
    expect(migration).toContain("('NZL', '🇳🇿')");
    expect(migration).toContain("('ZAF', '🇿🇦')");
    expect(migration).toContain("('AUS', '🇦🇺')");
    expect(migration).toContain("('FRA', '🇫🇷')");
    expect(migration).toContain("('JPN', '🇯🇵')");
    expect(migration).toContain("('Hong Kong China', '🇭🇰')");
  });
});
