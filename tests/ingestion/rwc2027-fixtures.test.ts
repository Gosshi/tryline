import { load } from "cheerio";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  fetchWithPolicy: vi.fn(),
  saveRawData: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  upsert: vi.fn(),
  standings: vi.fn(),
}));
vi.mock("@/lib/db/server", () => ({ getSupabaseServerClient: () => mocks }));
vi.mock("@/lib/scrapers", () => ({
  fetchWithPolicy: mocks.fetchWithPolicy,
  saveRawData: mocks.saveRawData,
}));
vi.mock("@/lib/ingestion/standings", () => ({
  upsertCompetitionStandings: mocks.standings,
}));

import { ingestRwc2027Fixtures } from "@/lib/ingestion/fixtures";
import {
  parseWikipediaRwc2027Html,
  resolveRwc2027TeamSlug,
  RWC_2027_POOL_ASSIGNMENTS,
  RWC_2027_POOL_PAGE_URLS,
} from "@/lib/ingestion/sources/wikipedia-rwc";

const pages = Object.entries(RWC_2027_POOL_PAGE_URLS).map(([pool, url]) => ({
  pool,
  url,
  html: readFileSync(
    `tests/fixtures/wikipedia-rwc2027-pool-${pool.slice(-1).toLowerCase()}.html`,
    "utf8",
  ),
}));
const parsed = pages.flatMap((page) =>
  parseWikipediaRwc2027Html(page.html, page.url).map((match) => ({
    ...match,
    pool: page.pool,
    url: page.url,
  })),
);
const teams = Object.keys(RWC_2027_POOL_ASSIGNMENTS).map((slug) => ({
  id: slug,
  slug,
}));
function existingRows() {
  return parsed.map((match, index) => ({
    id: `match-${index}`,
    competition_id: "competition",
    home_team_id: resolveRwc2027TeamSlug(match.homeTeamName),
    away_team_id: resolveRwc2027TeamSlug(match.awayTeamName),
    kickoff_at: new Date(Date.parse(match.kickoffAt!) - 3600000).toISOString(),
    kickoff_time_tbd: false,
    home_score: null,
    away_score: null,
    status: "scheduled",
    venue: match.venue,
    external_ids: {
      phase: "pool",
      pool_name: match.pool,
      round_name: match.pool,
      source: "wikipedia",
      wikipedia_url: match.url,
      wikipedia_event_id: `${match.homeTeamName}_v_${match.awayTeamName}`,
    },
  }));
}
let rows = existingRows();

beforeEach(() => {
  vi.resetAllMocks();
  rows = existingRows();
  mocks.fetchWithPolicy.mockImplementation(async (url: string) => ({
    text: async () => pages.find((p) => p.url === url)!.html,
  }));
  mocks.from.mockImplementation((table: string) => {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let pending: Record<string, unknown> | null = null;
    let inserting = false;
    const data = () =>
      table === "matches"
        ? rows.filter((row) => filters.every((f) => f(row)))
        : table === "teams"
          ? teams
          : table === "competition_standings"
            ? teams.map((t) => ({ team_id: t.id }))
            : [];
    const query = {
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      eq: vi.fn((key: string, value: unknown) => {
        filters.push((row) => row[key] === value);
        return query;
      }),
      in: vi.fn().mockReturnThis(),
      contains: vi.fn((_key: string, value: Record<string, unknown>) => {
        filters.push((row) =>
          Object.entries(value).every(
            ([key, val]) =>
              (row.external_ids as Record<string, unknown>)[key] === val,
          ),
        );
        return query;
      }),
      update: (value: Record<string, unknown>) => {
        mocks.update(table, value);
        pending = value;
        return query;
      },
      insert: (value: Record<string, unknown>) => {
        mocks.insert(table, value);
        pending = value;
        inserting = true;
        return query;
      },
      upsert: (value: unknown) => {
        mocks.upsert(table, value);
        return Promise.resolve({ error: null });
      },
      maybeSingle: async () => ({
        data: data()[0] ?? null,
        error: data().length > 1 ? new Error("Multiple matches") : null,
      }),
      single: async () => {
        if (table === "competitions")
          return { data: { id: "competition" }, error: null };
        if (inserting)
          return {
            data: { id: "inserted", external_ids: pending?.external_ids },
            error: null,
          };
        const target = data()[0];
        if (target && pending) Object.assign(target, pending);
        return { data: target, error: null };
      },
      then: (resolve: (value: unknown) => unknown) =>
        resolve({ data: data(), error: null }),
    };
    return query;
  });
});
afterEach(() => vi.restoreAllMocks());
function expectNoWrites() {
  for (const write of [
    mocks.update,
    mocks.insert,
    mocks.upsert,
    mocks.saveRawData,
    mocks.standings,
  ])
    expect(write).not.toHaveBeenCalled();
}

describe("RWC 2027 safe fixture ingestion", () => {
  it("matches all 36 existing team pairs with zero inserts even when legacy kickoffs differ", async () => {
    const result = await ingestRwc2027Fixtures({ dryRun: true });
    expect(result.dry_run?.counts).toEqual({
      parsed: 36,
      insert: 0,
      update: 36,
      unchanged: 0,
    });
    expect(result.dry_run?.matches).toHaveLength(36);
    expectNoWrites();
  });

  it("updates each match's own row despite Parsoid IDs colliding across pools", async () => {
    const franceJapan = parsed.find(
      (m) => m.homeTeamName === "France" && m.awayTeamName === "Japan",
    )!;
    const southAfricaItaly = parsed.findIndex(
      (m) => m.homeTeamName === "South Africa" && m.awayTeamName === "Italy",
    );
    expect(parsed[southAfricaItaly]!.eventId).toBe(franceJapan.eventId);
    // Model the symbol retained by an earlier ingestion in a different pool.
    rows[southAfricaItaly]!.external_ids.wikipedia_event_id =
      franceJapan.eventId!;
    rows.forEach((row, index) => {
      row.kickoff_at = parsed[index]!.kickoffAt!;
    });
    const idsBefore = rows.map((row) => row.external_ids.wikipedia_event_id);
    const result = await ingestRwc2027Fixtures();
    expect(result.counts).toMatchObject({
      matches_inserted: 0,
      matches_updated: 36,
      raw_data_rows: 36,
    });
    expect(mocks.update).toHaveBeenCalledTimes(36);
    expect(mocks.insert).not.toHaveBeenCalled();
    for (const [index, row] of rows.entries()) {
      expect(row.kickoff_at, `${row.home_team_id} v ${row.away_team_id}`).toBe(
        parsed[index]!.kickoffAt,
      );
      expect(row.external_ids.wikipedia_event_id).toBe(idsBefore[index]);
    }
    expect(mocks.saveRawData).toHaveBeenCalledTimes(36);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
  });

  it("does not save a page-local ID when the existing row has no Wikipedia ID", async () => {
    Reflect.deleteProperty(rows[0]!.external_ids, "wikipedia_event_id");
    await ingestRwc2027Fixtures();
    expect(rows[0]!.external_ids).not.toHaveProperty("wikipedia_event_id");
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("reports exact changed fields and existing IDs without writing in dry-run", async () => {
    const result = await ingestRwc2027Fixtures({ dryRun: true });
    expect(result.counts).toMatchObject({
      matches_inserted: 0,
      matches_updated: 0,
      raw_data_rows: 0,
      competition_teams_upserted: 0,
      pool_assignments_upserted: 0,
      standings_upserted: 0,
    });
    expect(result.dry_run?.matches[0]).toEqual({
      home_slug: "australia",
      away_slug: "hong-kong-china",
      kickoff_at: parsed[0]!.kickoffAt,
      venue: parsed[0]!.venue,
      operation: "update",
      id: "match-0",
      changes: {
        kickoff_at: {
          before: rows[0]!.kickoff_at,
          after: parsed[0]!.kickoffAt,
        },
      },
    });
    expectNoWrites();
  });

  it("reports unchanged rows accurately without writing", async () => {
    rows.forEach((row, index) => {
      row.kickoff_at = parsed[index]!.kickoffAt!;
    });
    const result = await ingestRwc2027Fixtures({ dryRun: true });
    expect(result.dry_run?.counts).toEqual({
      parsed: 36,
      insert: 0,
      update: 0,
      unchanged: 36,
    });
    expect(
      result.dry_run?.matches.every((m) => m.operation === "unchanged"),
    ).toBe(true);
    expectNoWrites();
  });

  it("rejects 35 parsed matches before any write", async () => {
    const $ = load(pages[5]!.html);
    $("div.vevent.summary").last().remove();
    mocks.fetchWithPolicy.mockImplementation(async (url: string) => ({
      text: async () =>
        url === pages[5]!.url
          ? $.html()
          : pages.find((p) => p.url === url)!.html,
    }));
    await expect(ingestRwc2027Fixtures()).rejects.toThrow(/36.*35/);
    expectNoWrites();
  });

  it("rejects inserts before any write, including when the missing row is last", async () => {
    rows.pop();
    await expect(ingestRwc2027Fixtures()).rejects.toThrow(/insert/i);
    expectNoWrites();
  });

  it("lets dry-run report a would-be insert without writing", async () => {
    rows.pop();
    const result = await ingestRwc2027Fixtures({ dryRun: true });
    expect(result.dry_run?.counts).toEqual({
      parsed: 36,
      insert: 1,
      update: 35,
      unchanged: 0,
    });
    expect(result.dry_run?.matches.at(-1)).toMatchObject({
      operation: "insert",
    });
    expectNoWrites();
  });

  it.each([false, true])(
    "rejects duplicate existing team pairs before writes (dryRun=%s)",
    async (dryRun) => {
      rows.push({ ...rows[35]!, id: "duplicate" });
      await expect(ingestRwc2027Fixtures({ dryRun })).rejects.toThrow(
        /duplicate/i,
      );
      expectNoWrites();
    },
  );

  it("warns about unknown venues and fails before writing the remaining 35", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const $ = load(pages[5]!.html);
    $("div.vevent.summary")
      .last()
      .find(".location")
      .text("Unknown Stadium, Unknown City");
    mocks.fetchWithPolicy.mockImplementation(async (url: string) => ({
      text: async () =>
        url === pages[5]!.url
          ? $.html()
          : pages.find((p) => p.url === url)!.html,
    }));
    await expect(ingestRwc2027Fixtures()).rejects.toThrow(/36.*35/);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("unknown venue"),
      expect.objectContaining({ venue: "Unknown Stadium, Unknown City" }),
    );
    expectNoWrites();
  });
});
