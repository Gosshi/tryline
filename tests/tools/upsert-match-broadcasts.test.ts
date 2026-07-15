import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildMatchBroadcastRows,
  logCliInputSummary,
  parseMatchBroadcastInput,
  shouldRunUpsertMatchBroadcastsCli,
  upsertMatchBroadcastsForInput,
  type MatchBroadcastInput,
} from "@/tools/upsert-match-broadcasts";

const input: MatchBroadcastInput = {
  broadcasts: [
    {
      kind: "tv",
      service_name: "WOWOW プライム",
      url: "https://example.com/wowow-prime",
    },
    {
      kind: "tv",
      service_name: "J SPORTS 4",
      url: "https://example.com/jsports-4",
    },
    {
      kind: "streaming",
      service_name: "WOWOW オンデマンド",
      url: "https://example.com/wowow-ondemand",
    },
    {
      kind: "streaming",
      service_name: "J SPORTS オンデマンド",
      url: "https://example.com/jsports-ondemand",
    },
  ],
  match_id: "b986f44f-4d3e-4642-a4b9-db8af6324722",
  source_url: "https://www.rugby-japan.jp/match/29967",
};

function createDbMock({ matchExists = true } = {}) {
  const matchesBuilder = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: matchExists
        ? {
            away_team: { name: "France" },
            home_team: { name: "Japan" },
            id: input.match_id,
            kickoff_at: "2026-07-18T10:00:00.000Z",
          }
        : null,
      error: null,
    }),
    select: vi.fn().mockReturnThis(),
  };
  const broadcastsBuilder = {
    select: vi.fn().mockResolvedValue({
      data: input.broadcasts.map((_, index) => ({ id: `broadcast-${index}` })),
      error: null,
    }),
    upsert: vi.fn().mockReturnThis(),
  };
  const db = {
    from: vi.fn((table: string) => {
      if (table === "matches") return matchesBuilder;
      if (table === "match_broadcasts") return broadcastsBuilder;
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { broadcastsBuilder, db, matchesBuilder };
}

describe("upsert-match-broadcasts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates kind before any database write", () => {
    expect(() =>
      parseMatchBroadcastInput({
        ...input,
        broadcasts: [{ ...input.broadcasts[0], kind: "radio" }],
      }),
    ).toThrow("broadcasts[].kind must be tv or streaming");
  });

  it("builds ordered upsert rows with the shared source URL", () => {
    const rows = buildMatchBroadcastRows(
      input,
      new Date("2026-07-15T12:00:00.000Z"),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        display_order: 0,
        kind: "tv",
        service_name: "WOWOW プライム",
        source_url: "https://www.rugby-japan.jp/match/29967",
        verified_at: "2026-07-15T12:00:00.000Z",
      }),
      expect.objectContaining({
        display_order: 1,
        kind: "tv",
        service_name: "J SPORTS 4",
      }),
      expect.objectContaining({
        display_order: 2,
        kind: "streaming",
        service_name: "WOWOW オンデマンド",
      }),
      expect.objectContaining({
        display_order: 3,
        kind: "streaming",
        service_name: "J SPORTS オンデマンド",
      }),
    ]);
  });

  it("detects run-ts.cjs execution by the target script argv entry", () => {
    expect(
      shouldRunUpsertMatchBroadcastsCli([
        "/usr/local/bin/node",
        "tools/upsert-match-broadcasts.ts",
        "input.json",
      ]),
    ).toBe(true);
    expect(
      shouldRunUpsertMatchBroadcastsCli([
        "/usr/local/bin/node",
        "tools/run-ts.cjs",
        "tools/upsert-match-broadcasts.ts",
      ]),
    ).toBe(false);
  });

  it("runs main through tools/run-ts.cjs instead of silently exiting", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        ["tools/run-ts.cjs", "tools/upsert-match-broadcasts.ts"],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: "pipe",
        },
      ),
    ).toThrow(/Usage: node --env-file=.env.production.local/);
  });

  it("logs the CLI input file, target match ID, and broadcast count before writing", () => {
    const logger = { error: vi.fn(), log: vi.fn() };

    logCliInputSummary({
      filePath: "tmp/broadcasts.json",
      input,
      logger,
    });

    expect(logger.log).toHaveBeenCalledWith("Input file: tmp/broadcasts.json");
    expect(logger.log).toHaveBeenCalledWith(
      `Target match ID: ${input.match_id}`,
    );
    expect(logger.log).toHaveBeenCalledWith("Broadcast count: 4");
  });

  it("upserts four rows idempotently by match and service name", async () => {
    const { broadcastsBuilder, db } = createDbMock();
    const logger = { error: vi.fn(), log: vi.fn() };

    await upsertMatchBroadcastsForInput({
      db: db as never,
      input,
      logger,
      now: () => new Date("2026-07-15T12:00:00.000Z"),
    });
    await upsertMatchBroadcastsForInput({
      db: db as never,
      input,
      logger,
      now: () => new Date("2026-07-15T12:00:00.000Z"),
    });

    expect(broadcastsBuilder.upsert).toHaveBeenCalledTimes(2);
    expect(broadcastsBuilder.upsert).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({
          match_id: input.match_id,
          service_name: "WOWOW プライム",
        }),
      ]),
      { onConflict: "match_id,service_name" },
    );
    expect(broadcastsBuilder.upsert.mock.calls[0]?.[0]).toHaveLength(4);
    expect(broadcastsBuilder.upsert.mock.calls[1]?.[0]).toHaveLength(4);
  });

  it("throws before writing when the match does not exist", async () => {
    const { broadcastsBuilder, db } = createDbMock({ matchExists: false });

    await expect(
      upsertMatchBroadcastsForInput({
        db: db as never,
        input,
        logger: { error: vi.fn(), log: vi.fn() },
      }),
    ).rejects.toThrow(`Match not found: ${input.match_id}`);

    expect(broadcastsBuilder.upsert).not.toHaveBeenCalled();
  });
});
