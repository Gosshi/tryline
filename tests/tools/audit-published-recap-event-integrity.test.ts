import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  auditPublishedRecapEventIntegrity,
  writeEventIntegrityAuditReport,
} from "@/tools/audit-published-recap-event-integrity";

import type { Database, Json } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const FIRST_MATCH_ID = "2c276057-bb3a-4617-a5b1-b7742e65f034";
const SECOND_MATCH_ID = "f01f68e2-bdd6-47c8-8910-0ea37a382b0a";
const HOME_TEAM_ID = "australia";
const AWAY_TEAM_ID = "japan";

type EventRow = {
  match_id: string;
  metadata: Json;
  minute: number;
  team_id: string;
  type: string;
};

function event(
  matchId: string,
  minute: number,
  type: string,
  teamId: string,
  playerName: string,
): EventRow {
  return {
    match_id: matchId,
    metadata: { player_name: playerName },
    minute,
    team_id: teamId,
    type,
  };
}

function fixtureEvents(matchId: string, reversed = false): EventRow[] {
  const swap = (teamId: string) =>
    !reversed ? teamId : teamId === HOME_TEAM_ID ? AWAY_TEAM_ID : HOME_TEAM_ID;
  const rows: EventRow[] = [];

  for (let index = 0; index < 5; index += 1) {
    rows.push(
      event(matchId, index + 1, "try", swap(HOME_TEAM_ID), `Home ${index}`),
    );
  }

  rows.push(
    event(matchId, 6, "conversion", swap(HOME_TEAM_ID), "Home conversion 1"),
  );
  rows.push(
    event(matchId, 7, "conversion", swap(HOME_TEAM_ID), "Home conversion 2"),
  );
  rows.push(event(matchId, 8, "penalty", swap(HOME_TEAM_ID), "Home penalty"));

  for (let index = 0; index < 6; index += 1) {
    rows.push(
      event(matchId, index + 9, "try", swap(AWAY_TEAM_ID), `Away ${index}`),
    );
  }

  rows.push(
    event(matchId, 15, "conversion", swap(AWAY_TEAM_ID), "Away conversion"),
  );
  rows.push(event(matchId, 16, "penalty", swap(AWAY_TEAM_ID), "Away penalty"));
  rows.push(event(matchId, 17, "yellow_card", swap(HOME_TEAM_ID), "Home card"));
  rows.push(event(matchId, 18, "yellow_card", swap(AWAY_TEAM_ID), "Away card"));
  rows.push(
    event(matchId, 19, "substitution", swap(HOME_TEAM_ID), "Substitution"),
  );

  return rows;
}

function match(
  id: string,
  homeScore: number | null,
  awayScore: number | null,
  externalIds: Json = {},
) {
  return {
    away_score: awayScore,
    away_team: { id: AWAY_TEAM_ID, name: "Japan", name_ja: "日本" },
    away_team_id: AWAY_TEAM_ID,
    competition: { slug: "rugby-championship-2026" },
    external_ids: externalIds,
    home_score: homeScore,
    home_team: { id: HOME_TEAM_ID, name: "Australia", name_ja: "豪州" },
    home_team_id: HOME_TEAM_ID,
    id,
    kickoff_at: "2026-08-15T10:00:00.000Z",
    status: "finished",
  };
}

function queryBuilder(data: unknown) {
  const forbiddenWrite = vi.fn(() => {
    throw new Error("audit must not write");
  });
  const builder = {
    delete: forbiddenWrite,
    in: vi.fn().mockReturnThis(),
    insert: forbiddenWrite,
    range: vi.fn(async () => ({ data, error: null })),
    select: vi.fn().mockReturnThis(),
    update: forbiddenWrite,
    upsert: forbiddenWrite,
  };

  return builder;
}

function createMockDb(params?: {
  events?: EventRow[];
  matches?: ReturnType<typeof match>[];
}) {
  const contents = queryBuilder([
    {
      content_type: "recap",
      generated_at: "2026-08-16T00:00:00.000Z",
      language: "ja",
      match_id: FIRST_MATCH_ID,
      prompt_version: "recap@4.20.0",
      status: "published",
    },
    {
      content_type: "recap",
      generated_at: "2026-08-17T00:00:00.000Z",
      language: "ja",
      match_id: SECOND_MATCH_ID,
      prompt_version: "recap@4.20.0",
      status: "published",
    },
    {
      content_type: "preview",
      generated_at: "2026-08-18T00:00:00.000Z",
      language: "ja",
      match_id: "preview-only",
      prompt_version: "preview@1.0.0",
      status: "published",
    },
    {
      content_type: "recap",
      generated_at: "2026-08-18T00:00:00.000Z",
      language: "ja",
      match_id: "draft-recap",
      prompt_version: "recap@4.20.0",
      status: "draft",
    },
  ]);
  const events = queryBuilder(
    params?.events ?? [
      ...fixtureEvents(FIRST_MATCH_ID),
      ...fixtureEvents(SECOND_MATCH_ID, true),
    ],
  );
  const matches = queryBuilder(
    params?.matches ?? [
      match(FIRST_MATCH_ID, 32, 35, {
        wikipedia_url: "https://example.com/first",
      }),
      match(SECOND_MATCH_ID, 56, 17, {
        wikipedia_url: "https://example.com/second",
      }),
      match("preview-only", null, null),
      match("draft-recap", null, null),
      match("contentless-finished", 20, 10),
    ],
  );

  return {
    from: vi.fn((table: string) => {
      if (table === "match_content") return contents;
      if (table === "match_events") return events;
      if (table === "matches") return matches;
      throw new Error(`Unexpected table: ${table}`);
    }),
  } as unknown as SupabaseClient<Database>;
}

describe("audit-published-recap-event-integrity", () => {
  it("reports the known reversed-event match as confirmed and keeps the source match score-consistent", async () => {
    const logs: string[] = [];
    const report = await auditPublishedRecapEventIntegrity(
      createMockDb(),
      { outputDir: "tmp/event-integrity-audit" },
      "2026-09-06T01:02:03.000Z",
      { log: (message) => logs.push(message) },
    );
    const secondMatch = report.findings.find(
      (finding) => finding.matchId === SECOND_MATCH_ID,
    );
    const firstMatch = report.findings.find(
      (finding) => finding.matchId === FIRST_MATCH_ID,
    );

    expect(logs).toEqual(["Published recap event-integrity audit targets: 2"]);
    expect(secondMatch).toEqual(
      expect.objectContaining({
        checksHit: expect.arrayContaining(["C1", "C3", "C4"]),
        pairedMatchIds: [FIRST_MATCH_ID],
        severity: "confirmed",
        url: `https://www.trylinerugby.com/matches/${SECOND_MATCH_ID}`,
      }),
    );
    expect(firstMatch?.checksHit).not.toContain("C1");
    expect(firstMatch?.eventHomeTotal).toBe(32);
    expect(firstMatch?.eventAwayTotal).toBe(35);
    expect(report.groups).toEqual({
      contentlessFinished: 1,
      draftRecap: 1,
      previewOnly: 1,
    });
    expect(report.currentDataNote).toContain("現在のデータ");
  });

  it("does not report three matching signatures as C3", async () => {
    const shortFirst = [
      event(FIRST_MATCH_ID, 1, "try", HOME_TEAM_ID, "One"),
      event(FIRST_MATCH_ID, 2, "try", AWAY_TEAM_ID, "Two"),
      event(FIRST_MATCH_ID, 3, "penalty", HOME_TEAM_ID, "Three"),
    ];
    const shortSecond = shortFirst.map((row) => ({
      ...row,
      match_id: SECOND_MATCH_ID,
    }));
    const report = await auditPublishedRecapEventIntegrity(
      createMockDb({
        events: [...shortFirst, ...shortSecond],
        matches: [
          match(FIRST_MATCH_ID, 8, 5),
          match(SECOND_MATCH_ID, 8, 5),
          match("contentless-finished", 20, 10),
        ],
      }),
      { outputDir: "tmp/event-integrity-audit" },
    );

    expect(report.findings).toEqual([]);
    expect(report.summary.C3).toBe(0);
  });

  it("keeps a partial team-assignment reversal at suspect C3", async () => {
    const base = fixtureEvents(FIRST_MATCH_ID).slice(0, 4);
    const partial = base.map((row, index) => ({
      ...row,
      match_id: SECOND_MATCH_ID,
      team_id: index === 0 ? AWAY_TEAM_ID : row.team_id,
    }));
    const report = await auditPublishedRecapEventIntegrity(
      createMockDb({
        events: [...base, ...partial],
        matches: [
          match(FIRST_MATCH_ID, 20, 0),
          match(SECOND_MATCH_ID, 15, 5),
          match("contentless-finished", 20, 10),
        ],
      }),
      { outputDir: "tmp/event-integrity-audit" },
    );
    const secondMatch = report.findings.find(
      (finding) => finding.matchId === SECOND_MATCH_ID,
    );

    expect(secondMatch).toEqual(
      expect.objectContaining({
        checksHit: ["C3"],
        severity: "suspect",
      }),
    );
  });

  it("writes a quoted CSV and snapshot summary report", async () => {
    const report = await auditPublishedRecapEventIntegrity(
      createMockDb(),
      { outputDir: "tmp/event-integrity-audit" },
      "2026-09-06T01:02:03.000Z",
    );
    const temporaryDirectory = await import("node:fs/promises").then(
      ({ mkdtemp }) =>
        mkdtemp(
          path.join(process.env.TMPDIR ?? "/tmp", "event-integrity-audit-"),
        ),
    );
    const paths = await writeEventIntegrityAuditReport(
      report,
      temporaryDirectory,
    );
    const summary = JSON.parse(readFileSync(paths.summaryPath, "utf8"));
    const csv = readFileSync(paths.csvPath, "utf8");

    expect(summary.checks.targetDistinctMatchCount).toBe(2);
    expect(summary.groups).toEqual({
      contentless_finished: 1,
      draft_recap: 1,
      preview_only: 1,
    });
    expect(summary.current_data_note).toContain("生成時点のデータを再現");
    expect(summary.identifier_quality).toEqual({
      matches_with_fixture_identifier: 0,
      matches_without_fixture_identifier: 5,
      unreliable_key_collisions: [],
      unreliable_key_collision_limit: 100,
      unreliable_key_collision_total: 0,
      unreliable_key_collision_remaining: 0,
    });
    expect(csv).toContain("match_id,url,competition_slug");
    expect(csv).toContain(
      `https://www.trylinerugby.com/matches/${SECOND_MATCH_ID}`,
    );
    expect(csv).toContain(`[""${FIRST_MATCH_ID}""]`);
  });

  it.each(["wikipedia_url", "wikipedia_event_id", "top14_lnr_url"])(
    "does not count shared %s as C5 or add findings",
    async (key) => {
      const report = await auditPublishedRecapEventIntegrity(
        createMockDb({
          events: [
            event(FIRST_MATCH_ID, 1, "try", HOME_TEAM_ID, "One"),
            event(SECOND_MATCH_ID, 2, "try", HOME_TEAM_ID, "Two"),
          ],
          matches: [
            match(FIRST_MATCH_ID, 5, 0, { [key]: "shared=value" }),
            {
              ...match(SECOND_MATCH_ID, 5, 0, { [key]: "shared=value" }),
              competition: { slug: "another-competition" },
            },
            match("without-content-or-events", null, null, {
              match_url: "https://example.org/m/3",
            }),
          ],
        }),
      );

      expect(report.summary.C5).toBe(0);
      expect(report.findings).toEqual([]);
      expect(report.identifierQuality).toEqual({
        matchesWithFixtureIdentifier: 1,
        matchesWithoutFixtureIdentifier: 2,
        unreliableKeyCollisions: [
          {
            key,
            value: "shared=value",
            matchIds: [FIRST_MATCH_ID, SECOND_MATCH_ID],
          },
        ],
        unreliableKeyCollisionLimit: 100,
        unreliableKeyCollisionTotal: 1,
        unreliableKeyCollisionRemaining: 0,
      });
    },
  );

  it("counts shared match_url as C5", async () => {
    const report = await auditPublishedRecapEventIntegrity(
      createMockDb({
        events: [
          event(FIRST_MATCH_ID, 1, "try", HOME_TEAM_ID, "One"),
          event(SECOND_MATCH_ID, 2, "try", HOME_TEAM_ID, "Two"),
        ],
        matches: [
          match(FIRST_MATCH_ID, 5, 0, { match_url: "https://example.org/m/1" }),
          match(SECOND_MATCH_ID, 5, 0, {
            match_url: "https://example.org/m/1",
          }),
        ],
      }),
    );

    expect(report.summary.C5).toBe(2);
    expect(report.findings).toEqual([
      expect.objectContaining({
        matchId: FIRST_MATCH_ID,
        checksHit: ["C5"],
        pairedMatchIds: [SECOND_MATCH_ID],
        severity: "suspect",
      }),
      expect.objectContaining({
        matchId: SECOND_MATCH_ID,
        checksHit: ["C5"],
        pairedMatchIds: [FIRST_MATCH_ID],
        severity: "suspect",
      }),
    ]);
  });

  it("caps unreliable collisions and reports the remaining count across all matches", async () => {
    const matches = Array.from({ length: 101 }, (_, index) =>
      (index === 0 ? ["first", "second", "third"] : ["first", "second"]).map(
        (side) =>
          match(`${index}-${side}`, null, null, {
            wikipedia_event_id:
              index === 0 ? "mw-content-text" : `anchor-${index}`,
          }),
      ),
    ).flat();
    const report = await auditPublishedRecapEventIntegrity(
      createMockDb({ events: [], matches }),
    );

    expect(report.summary.C5).toBe(0);
    expect(report.identifierQuality).toEqual({
      matchesWithFixtureIdentifier: 0,
      matchesWithoutFixtureIdentifier: 203,
      unreliableKeyCollisions: expect.any(Array),
      unreliableKeyCollisionLimit: 100,
      unreliableKeyCollisionTotal: 101,
      unreliableKeyCollisionRemaining: 1,
    });
    expect(report.identifierQuality.unreliableKeyCollisions).toHaveLength(100);
    expect(report.identifierQuality.unreliableKeyCollisions).toContainEqual({
      key: "wikipedia_event_id",
      value: "mw-content-text",
      matchIds: ["0-first", "0-second", "0-third"],
    });
    const outputDir = await mkdtemp("/tmp/event-integrity-quality-");
    const paths = await writeEventIntegrityAuditReport(report, outputDir);
    const summary = JSON.parse(readFileSync(paths.summaryPath, "utf8"));

    expect(summary.identifier_quality.unreliable_key_collision_limit).toBe(100);
    expect(summary.identifier_quality.unreliable_key_collision_total).toBe(101);
    expect(summary.identifier_quality.unreliable_key_collision_remaining).toBe(
      1,
    );
    expect(summary.identifier_quality.unreliable_key_collisions).toHaveLength(
      100,
    );
    expect(summary.identifier_quality.unreliable_key_collisions[0]).toEqual({
      key: "wikipedia_event_id",
      value: "mw-content-text",
      match_ids: ["0-first", "0-second", "0-third"],
    });
    expect(readFileSync(paths.csvPath, "utf8")).not.toContain(
      "mw-content-text",
    );
  });

  it("contains no database writes or LLM imports", () => {
    const source = readFileSync(
      path.join(
        process.cwd(),
        "tools/audit-published-recap-event-integrity.ts",
      ),
      "utf8",
    );

    expect(source).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
    expect(source).not.toMatch(
      /getOpenAIClient|MODELS|createWebSearchJsonResponse/,
    );
    expect(source).toContain("computeEventPointTotals");
    expect(source).toContain("eventTotalsMatchFinalScore");
    expect(source).toContain("toScoreTimelineEvent");
  });
});
