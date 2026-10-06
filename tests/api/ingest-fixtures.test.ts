import { beforeEach, describe, expect, it, vi } from "vitest";

import { revalidatePublicData } from "@/lib/cache/public-data";
import { FixtureIngestSafetyError } from "@/lib/ingestion/fixture-ingest-error";

vi.mock("@/lib/cache/public-data", () => ({
  PUBLIC_DATA_CACHE_TAGS: {
    competitions: "public-data:competitions",
    matches: "public-data:matches",
    teams: "public-data:teams",
  },
  revalidatePublicData: vi.fn(),
}));

const fixturesMock = vi.hoisted(() => ({
  ingestRwc2027Fixtures: vi.fn(),
  ingestSixNations2027Fixtures: vi.fn(),
}));

vi.mock("@/lib/ingestion/fixtures", () => fixturesMock);

beforeEach(() => {
  vi.clearAllMocks();

  process.env.NEXT_PUBLIC_SUPABASE_URL = "";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "";
  process.env.OPENAI_API_KEY = "";
  process.env.SCRAPER_USER_AGENT = "Tryline Test Bot/1.0 (+test@example.com)";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  process.env.VAPID_PRIVATE_KEY = "";
  process.env.VAPID_PUBLIC_KEY = "";
  process.env.VAPID_SUBJECT = "";
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.WIKIPEDIA_SQUAD_URL =
    "https://en.wikipedia.org/wiki/2025_Six_Nations_Championship_squads";

  fixturesMock.ingestSixNations2027Fixtures.mockResolvedValue({
    competition: "six-nations-2027",
    counts: {
      matches_inserted: 2,
      matches_updated: 0,
      raw_data_rows: 2,
      standings_upserted: 6,
    },
  });
});

describe("/api/cron/ingest-fixtures", () => {
  it("returns 401 without a bearer token", async () => {
    const { POST } = await import("@/app/api/cron/ingest-fixtures/route");
    const response = await POST(
      new Request("http://localhost/api/cron/ingest-fixtures", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(fixturesMock.ingestSixNations2027Fixtures).not.toHaveBeenCalled();
  });

  it("returns 200 with the correct bearer token", async () => {
    const { POST } = await import("@/app/api/cron/ingest-fixtures/route");
    const response = await POST(
      new Request("http://localhost/api/cron/ingest-fixtures", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-cron-secret",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      competition: "six-nations-2027",
      counts: {
        matches_inserted: 2,
        matches_updated: 0,
        raw_data_rows: 2,
        standings_upserted: 6,
      },
      status: "ok",
    });
    expect(fixturesMock.ingestSixNations2027Fixtures).toHaveBeenCalledTimes(1);
    expect(fixturesMock.ingestSixNations2027Fixtures).toHaveBeenCalledWith({
      dryRun: false,
    });
    expect(revalidatePublicData).toHaveBeenCalledTimes(1);
  });
});

describe("fixture dry-run API", () => {
  it.each(["rwc-2027", "six-nations-2027"])(
    "returns the %s plan without invalidating caches",
    async (competition) => {
      vi.clearAllMocks();
      const dry_run = {
        counts: { parsed: 1, insert: 0, update: 1, unchanged: 0 },
        matches: [
          {
            home_slug: "france",
            away_slug: "japan",
            kickoff_at: "2027-10-09T08:45:00.000Z",
            venue: "Brisbane Stadium, Brisbane",
            operation: "update",
            id: "match-1",
            changes: {
              kickoff_at: {
                before: "2027-10-09T07:45:00.000Z",
                after: "2027-10-09T08:45:00.000Z",
              },
            },
          },
        ],
      };
      const ingest =
        competition === "rwc-2027"
          ? fixturesMock.ingestRwc2027Fixtures
          : fixturesMock.ingestSixNations2027Fixtures;
      ingest.mockResolvedValue({
        competition,
        counts: {
          matches_inserted: 0,
          matches_updated: 0,
          raw_data_rows: 0,
          standings_upserted: 0,
        },
        dry_run,
      });
      const { POST } = await import("@/app/api/cron/ingest-fixtures/route");
      const response = await POST(
        new Request("http://localhost/api/cron/ingest-fixtures", {
          method: "POST",
          headers: { Authorization: "Bearer test-cron-secret" },
          body: JSON.stringify({ competition, dryRun: true }),
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        status: "ok",
        competition,
        dry_run,
      });
      expect(ingest).toHaveBeenCalledWith({ dryRun: true });
      expect(revalidatePublicData).not.toHaveBeenCalled();
    },
  );

  it("returns HTTP 500 with the safety reason", async () => {
    fixturesMock.ingestRwc2027Fixtures.mockRejectedValue(
      new FixtureIngestSafetyError(
        "Refusing RWC 2027 ingest: 1 insert(s) planned",
      ),
    );
    const { POST } = await import("@/app/api/cron/ingest-fixtures/route");
    const response = await POST(
      new Request("http://localhost/api/cron/ingest-fixtures", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
        body: JSON.stringify({ competition: "rwc-2027" }),
      }),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Failed to ingest fixtures",
      reason: "Refusing RWC 2027 ingest: 1 insert(s) planned",
    });
  });

  it("rejects a non-boolean dryRun before calling ingestion", async () => {
    vi.clearAllMocks();
    const { POST } = await import("@/app/api/cron/ingest-fixtures/route");
    const response = await POST(
      new Request("http://localhost/api/cron/ingest-fixtures", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
        body: JSON.stringify({ dryRun: "true" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(fixturesMock.ingestRwc2027Fixtures).not.toHaveBeenCalled();
    expect(fixturesMock.ingestSixNations2027Fixtures).not.toHaveBeenCalled();
  });
});
