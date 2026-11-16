import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  broadcastsBuilder: {
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    then: vi.fn(),
  },
  from: vi.fn(),
  rows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/db/public-server", () => ({
  getSupabasePublicServerClient: () => ({
    from: dbMock.from,
  }),
}));

describe("match broadcast queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.from.mockReturnValue(dbMock.broadcastsBuilder);
    dbMock.broadcastsBuilder.then.mockImplementation((resolve) =>
      Promise.resolve(
        resolve({
          data: dbMock.rows,
          error: null,
        }),
      ),
    );
    dbMock.rows = [
      {
        display_order: 0,
        kind: "tv",
        match_id: "match-1",
        service_name: "WOWOW プライム",
        source_url: "https://source.example.com",
        url: "https://example.com/wowow",
        verified_at: "2026-07-15T12:00:00.000Z",
      },
      {
        display_order: 1,
        kind: "streaming",
        match_id: "match-1",
        service_name: "J SPORTS オンデマンド",
        source_url: null,
        url: "https://example.com/jsports",
        verified_at: "2026-07-15T13:00:00.000Z",
      },
    ];
  });

  it("loads broadcasts grouped by match in display order", async () => {
    const { getMatchBroadcastsForMatches } =
      await import("@/lib/db/queries/match-broadcasts");

    const broadcasts = await getMatchBroadcastsForMatches(["match-1"]);

    expect(dbMock.from).toHaveBeenCalledWith("match_broadcasts");
    expect(dbMock.broadcastsBuilder.in).toHaveBeenCalledWith("match_id", [
      "match-1",
    ]);
    expect(dbMock.broadcastsBuilder.order).toHaveBeenNthCalledWith(
      1,
      "display_order",
      { ascending: true },
    );
    expect(broadcasts.get("match-1")).toEqual([
      {
        displayOrder: 0,
        kind: "tv",
        scope: "match",
        serviceName: "WOWOW プライム",
        sourceUrl: "https://source.example.com",
        url: "https://example.com/wowow",
        verifiedAt: "2026-07-15T12:00:00.000Z",
      },
      {
        displayOrder: 1,
        kind: "streaming",
        scope: "match",
        serviceName: "J SPORTS オンデマンド",
        sourceUrl: null,
        url: "https://example.com/jsports",
        verifiedAt: "2026-07-15T13:00:00.000Z",
      },
    ]);
  });

  it("returns an empty map without querying for an empty input", async () => {
    const { getMatchBroadcastsForMatches } =
      await import("@/lib/db/queries/match-broadcasts");

    await expect(getMatchBroadcastsForMatches([])).resolves.toEqual(new Map());
    expect(dbMock.from).not.toHaveBeenCalled();
  });

  it("returns unique broadcast services in display order across matches", async () => {
    dbMock.rows = [
      {
        display_order: 2,
        kind: "streaming",
        match_id: "match-1",
        service_name: "J SPORTS オンデマンド",
        source_url: null,
        url: "https://example.com/jsports-ondemand",
        verified_at: "2026-07-15T13:00:00.000Z",
      },
      {
        display_order: 0,
        kind: "tv",
        match_id: "match-2",
        service_name: "J SPORTS 3",
        source_url: null,
        url: "https://example.com/j-sports-3",
        verified_at: "2026-07-15T13:00:00.000Z",
      },
      {
        display_order: 1,
        kind: "tv",
        match_id: "match-3",
        service_name: "J SPORTS 3",
        source_url: null,
        url: "https://example.com/j-sports-3",
        verified_at: "2026-07-15T13:00:00.000Z",
      },
    ];
    const { getMatchBroadcastServicesForMatches } =
      await import("@/lib/db/queries/match-broadcasts");

    await expect(
      getMatchBroadcastServicesForMatches(["match-1", "match-2", "match-3"]),
    ).resolves.toEqual([
      {
        displayOrder: 0,
        kind: "tv",
        serviceName: "J SPORTS 3",
        url: "https://example.com/j-sports-3",
      },
      {
        displayOrder: 2,
        kind: "streaming",
        serviceName: "J SPORTS オンデマンド",
        url: "https://example.com/jsports-ondemand",
      },
    ]);
  });
});

describe("competition broadcast fallback", () => {
  type Row = Record<string, unknown>;
  type Result = { data: Row[] | null; error: unknown };
  let matches: Row[];
  let defaults: Row[];
  let manual: Row[];
  const queries: Array<{
    table: string;
    select: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
  }> = [];
  const failures = new Map<string, { error: unknown; thrown?: boolean }>();
  let errorLog: ReturnType<typeof vi.spyOn>;
  const verifiedAt = "2026-11-16T12:00:00Z";
  const sourceUrl = "https://example.test/all-matches-announcement";
  const makeDefault = (
    service_name: string,
    display_order: number,
    kind = "streaming",
    competition_id = "league-one-2026-27",
  ) => ({
    competition_id,
    service_name,
    display_order,
    kind,
    verified_at: verifiedAt,
    source_url: sourceUrl,
    url: `https://example.test/${display_order}`,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    queries.length = 0;
    failures.clear();
    errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    matches = [
      { id: "A", competition_id: "league-one-2026-27", status: "scheduled" },
      { id: "B", competition_id: "league-one-2026-27", status: "scheduled" },
      { id: "C", competition_id: "league-one-2026-27", status: "cancelled" },
      { id: "D", competition_id: "league-one-2025-26", status: "finished" },
    ];
    defaults = [
      makeDefault("DAZN", 20),
      makeDefault("J SPORTS（BS）", 0, "tv"),
      makeDefault("J SPORTSオンデマンド", 10),
    ];
    manual = [
      {
        match_id: "B",
        service_name: "J SPORTS 1",
        kind: "tv",
        display_order: 0,
        verified_at: "2026-11-17T00:00:00Z",
        source_url: "https://example.test/match-schedule",
        url: "https://example.test/match-b",
      },
    ];
    dbMock.from.mockImplementation((table: string) => {
      if (
        !["match_broadcasts", "matches", "competition_broadcasts"].includes(
          table,
        )
      )
        throw new Error(`Unexpected table ${table}`);
      const queryIndex = queries.filter(
        (query) => query.table === table,
      ).length;
      let filter: { column: string; ids: string[] } | undefined;
      const orders: string[] = [];
      const query = {
        table,
        select: vi.fn(),
        in: vi.fn(),
        order: vi.fn(),
        then: vi.fn(),
      };
      query.select.mockReturnValue(query);
      query.in.mockImplementation((column: string, ids: string[]) => {
        filter = { column, ids };
        return query;
      });
      query.order.mockImplementation((column: string) => {
        orders.push(column);
        return query;
      });
      query.then.mockImplementation(
        (
          resolve: (result: Result) => unknown,
          reject: (error: unknown) => unknown,
        ) => {
          const failure = failures.get(`${table}:${queryIndex}`);
          if (failure?.thrown)
            return Promise.reject(failure.error).then(resolve, reject);
          const source =
            table === "match_broadcasts"
              ? manual
              : table === "matches"
                ? matches
                : defaults;
          const data = source
            .filter(
              (row) =>
                !filter || filter.ids.includes(String(row[filter.column])),
            )
            .sort((a, b) => {
              for (const column of orders) {
                const comparison =
                  typeof a[column] === "number"
                    ? Number(a[column]) - Number(b[column])
                    : String(a[column]).localeCompare(String(b[column]), "ja");
                if (comparison) return comparison;
              }
              return 0;
            });
          return Promise.resolve({
            data: failure ? null : data,
            error: failure?.error ?? null,
          }).then(resolve, reject);
        },
      );
      queries.push(query);
      return query;
    });
  });
  afterEach(() => {
    errorLog.mockRestore();
  });

  it("returns the three ordered competition rows with their verification and source for A", async () => {
    const { getMatchBroadcastsForMatches } =
      await import("@/lib/db/queries/match-broadcasts");
    const result = await getMatchBroadcastsForMatches(["A"]);
    expect(result.get("A")).toEqual([
      {
        displayOrder: 0,
        kind: "tv",
        scope: "competition",
        serviceName: "J SPORTS（BS）",
        sourceUrl,
        url: "https://example.test/0",
        verifiedAt,
      },
      {
        displayOrder: 10,
        kind: "streaming",
        scope: "competition",
        serviceName: "J SPORTSオンデマンド",
        sourceUrl,
        url: "https://example.test/10",
        verifiedAt,
      },
      {
        displayOrder: 20,
        kind: "streaming",
        scope: "competition",
        serviceName: "DAZN",
        sourceUrl,
        url: "https://example.test/20",
        verifiedAt,
      },
    ]);
  });
  it("keeps B's one match row exclusively, even when the same competition supplies defaults for A", async () => {
    const { getMatchBroadcastsForMatches } =
      await import("@/lib/db/queries/match-broadcasts");
    const result = await getMatchBroadcastsForMatches(["A", "B"]);
    expect(result.get("B")).toEqual([
      {
        displayOrder: 0,
        kind: "tv",
        scope: "match",
        serviceName: "J SPORTS 1",
        sourceUrl: "https://example.test/match-schedule",
        url: "https://example.test/match-b",
        verifiedAt: "2026-11-17T00:00:00Z",
      },
    ]);
    expect(
      queries.find((query) => query.table === "matches")?.in,
    ).toHaveBeenCalledWith("id", ["A"]);
  });
  it("does not read fallback tables when every requested match has its own rows", async () => {
    const { getMatchBroadcastsForMatches } =
      await import("@/lib/db/queries/match-broadcasts");
    await getMatchBroadcastsForMatches(["B"]);
    expect(queries.map((query) => query.table)).toEqual(["match_broadcasts"]);
  });
  it("omits cancelled C, unmatched D and unknown IDs without empty keys", async () => {
    const { getMatchBroadcastsForMatches } =
      await import("@/lib/db/queries/match-broadcasts");
    const result = await getMatchBroadcastsForMatches(["C", "D", "unknown"]);
    expect(result).toEqual(new Map());
    expect(
      queries.find((query) => query.table === "competition_broadcasts")?.in,
    ).toHaveBeenCalledWith("competition_id", ["league-one-2025-26"]);
  });
  it("does not query competition rows when only cancelled matches are missing broadcasts", async () => {
    const { getMatchBroadcastsForMatches } =
      await import("@/lib/db/queries/match-broadcasts");
    expect(await getMatchBroadcastsForMatches(["C"])).toEqual(new Map());
    expect(
      queries.some((query) => query.table === "competition_broadcasts"),
    ).toBe(false);
  });
  it.each(["matches", "competition_broadcasts"])(
    "returns manual rows and logs once on a %s query error",
    async (table) => {
      const error = { message: `${table} not available`, code: "42P01" };
      failures.set(`${table}:0`, { error });
      const { getMatchBroadcastsForMatches } =
        await import("@/lib/db/queries/match-broadcasts");
      const result = await getMatchBroadcastsForMatches(["A", "B", "C"]);
      expect([...result.keys()]).toEqual(["B"]);
      expect(result.get("B")?.[0]?.scope).toBe("match");
      expect(errorLog).toHaveBeenCalledExactlyOnceWith(
        "[match-broadcasts] competition fallback failed",
        { matchIdCount: 2, error },
      );
    },
  );
  it.each(["matches", "competition_broadcasts"])(
    "also tolerates a thrown %s read exception",
    async (table) => {
      const error = new Error("temporary read failure");
      failures.set(`${table}:0`, { error, thrown: true });
      const { getMatchBroadcastsForMatches } =
        await import("@/lib/db/queries/match-broadcasts");
      expect([
        ...(await getMatchBroadcastsForMatches(["A", "B"])).keys(),
      ]).toEqual(["B"]);
      expect(errorLog).toHaveBeenCalledTimes(1);
    },
  );
  it("still throws errors from the original match_broadcasts read", async () => {
    const error = new Error("match broadcast read failed");
    failures.set("match_broadcasts:0", { error });
    const { getMatchBroadcastsForMatches } =
      await import("@/lib/db/queries/match-broadcasts");
    await expect(getMatchBroadcastsForMatches(["A", "B"])).rejects.toBe(error);
    expect(errorLog).not.toHaveBeenCalled();
    expect(queries.map((query) => query.table)).toEqual(["match_broadcasts"]);
  });
  it("includes A and B in presence, excluding cancelled C", async () => {
    const { getMatchBroadcastPresenceForMatches } =
      await import("@/lib/db/queries/match-broadcasts");
    expect(await getMatchBroadcastPresenceForMatches(["A", "B", "C"])).toEqual(
      new Set(["A", "B"]),
    );
  });
  it("keeps all in() batches at 200 IDs, including competition IDs", async () => {
    const ids = Array.from({ length: 401 }, (_, index) => `match-${index}`);
    matches = ids.map((id, index) => ({
      id,
      competition_id: `competition-${index}`,
      status: "scheduled",
    }));
    defaults = ids.map((_, index) =>
      makeDefault("DAZN", 20, "streaming", `competition-${index}`),
    );
    const { getMatchBroadcastsForMatches } =
      await import("@/lib/db/queries/match-broadcasts");
    const result = await getMatchBroadcastsForMatches(ids);
    expect(result.size).toBe(401);
    for (const table of [
      "match_broadcasts",
      "matches",
      "competition_broadcasts",
    ]) {
      expect(
        queries
          .filter((query) => query.table === table)
          .map((query) => query.in.mock.calls[0]![1].length),
      ).toEqual([200, 200, 1]);
    }
  });
  it("discards all defaults if a later competition batch fails", async () => {
    const ids = Array.from({ length: 201 }, (_, index) => `match-${index}`);
    matches = ids.map((id, index) => ({
      id,
      competition_id: `competition-${index}`,
      status: "scheduled",
    }));
    defaults = ids.map((_, index) =>
      makeDefault("DAZN", 20, "streaming", `competition-${index}`),
    );
    failures.set("competition_broadcasts:1", {
      error: new Error("second batch failed"),
    });
    const { getMatchBroadcastsForMatches } =
      await import("@/lib/db/queries/match-broadcasts");
    expect([
      ...(await getMatchBroadcastsForMatches(["B", ...ids])).keys(),
    ]).toEqual(["B"]);
    expect(errorLog).toHaveBeenCalledTimes(1);
  });
  it("keeps the API v1 DTO limited to kind, service_name and url for both scopes", async () => {
    const { getV1BroadcastsForMatches } = await import("@/lib/api/v1/server");
    const result = await getV1BroadcastsForMatches(["A", "B"]);
    expect(result.get("A")).toHaveLength(3);
    expect(result.get("B")).toEqual([
      {
        kind: "tv",
        service_name: "J SPORTS 1",
        url: "https://example.test/match-b",
      },
    ]);
    for (const rows of result.values())
      for (const row of rows)
        expect(Object.keys(row).sort()).toEqual([
          "kind",
          "service_name",
          "url",
        ]);
  });
  it("exposes competition services through the existing service lookup without scope leaking", async () => {
    const { getMatchBroadcastServicesForMatches } =
      await import("@/lib/db/queries/match-broadcasts");
    const services = await getMatchBroadcastServicesForMatches(["A", "B"]);
    expect(new Set(services.map((service) => service.serviceName))).toEqual(
      new Set(["J SPORTS（BS）", "J SPORTSオンデマンド", "DAZN", "J SPORTS 1"]),
    );
    for (const service of services)
      expect(Object.hasOwn(service, "scope")).toBe(false);
  });
});
