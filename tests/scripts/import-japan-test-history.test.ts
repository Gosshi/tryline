import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { importJapanTestHistory } from "@/scripts/import-japan-test-history";

const wikitext = await readFile(
  "tests/fixtures/wikipedia-japan-test-matches.wiki",
  "utf8",
);
const teams = [
  { id: "jp", slug: "japan", name: "Japan", kind: "national" },
  { id: "wa", slug: "wales", name: "Wales", kind: "national" },
  { id: "eng", slug: "england", name: "England", kind: "national" },
  { id: "sco", slug: "scotland", name: "Scotland", kind: "national" },
  { id: "fij", slug: "fiji", name: "Fiji", kind: "national" },
  { id: "us", slug: "united-states", name: "United States", kind: "national" },
  {
    id: "hk",
    slug: "hong-kong-china",
    name: "Hong Kong China",
    kind: "national",
  },
  { id: "cl", slug: "chile", name: "Chile", kind: "national" },
];

describe("importJapanTestHistory", () => {
  it("defaults to a read-only dry-run and reports known and unknown opponent counts", async () => {
    const upsert = vi.fn();
    const result = await importJapanTestHistory({
      apply: false,
      wikitext,
      teams,
      upsert,
      today: "2026-09-23",
    });
    expect(upsert).not.toHaveBeenCalled();
    expect(result.imported).toBeGreaterThan(0);
    expect(result.opponentCounts.Wales).toBe(13);
    expect(result.opponentCounts.England).toBe(6);
    expect(result.opponentCounts.Scotland).toBe(9);
    expect(result.opponentCounts.Fiji).toBe(22);
    expect(result.opponentCounts["United States"]).toBe(26);
    expect(result.opponentCounts["Hong Kong"]).toBeGreaterThan(0);
    expect(result.opponentCounts.Chile).toBeGreaterThan(0);
    expect(result.unknownOpponentCounts["Arabian Gulf"]).toBeGreaterThan(0);
    expect(result.unknownOpponentCounts["Chinese Taipei"]).toBeGreaterThan(0);
  });

  it("upserts only mapped rows when apply is enabled", async () => {
    let written: Array<{
      team_id: string;
      opponent_team_id: string;
      source_url: string;
    }> = [];
    const upsert = vi.fn(async (rows: typeof written, _onConflict: string) => {
      written = rows;
    });
    const result = await importJapanTestHistory({
      apply: true,
      wikitext,
      teams,
      upsert,
      today: "2026-09-23",
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0]?.[1]).toBe(
      "team_id,opponent_team_id,played_on",
    );
    expect(
      written.every(
        (row) => row.team_id === "jp" && row.opponent_team_id !== "jp",
      ),
    ).toBe(true);
    expect(
      written.every((row) =>
        row.source_url.startsWith("https://en.wikipedia.org/"),
      ),
    ).toBe(true);
    expect(result.applied).toBe(true);
  });
});
