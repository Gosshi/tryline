import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  validate: vi.fn(),
  upsert: vi.fn(),
  content: vi.fn(),
  eq: vi.fn(),
  statuses: vi.fn(),
  match: vi.fn(),
}));
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/discord/source-url", () => ({
  OWNER_VERIFIABLE_SOURCE_URL_STATUSES: new Set([401, 403, 429]),
  validateSourceUrl: mocks.validate,
}));

import {
  decideManualFactRegeneration,
  saveManualResearchFacts,
} from "@/lib/sourced-facts/manual-entry";

beforeEach(() => {
  vi.clearAllMocks();
  const contentBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: mocks.eq,
    in: mocks.statuses,
    maybeSingle: mocks.content,
  };
  mocks.eq.mockReturnValue(contentBuilder);
  mocks.statuses.mockReturnValue(contentBuilder);
  mocks.content.mockResolvedValue({ data: null, error: null });
  mocks.match.mockResolvedValue({ data: { kickoff_at: "2999-01-01T00:00:00Z" }, error: null });
  mocks.from.mockImplementation((table) =>
    table === "match_content"
      ? contentBuilder
      : table === "matches"
        ? {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: mocks.match,
          }
        : { upsert: mocks.upsert },
  );
  mocks.upsert.mockImplementation((rows) => ({
    select: vi.fn(async () => ({
      data: rows.map((row: { fact: string }) => ({ fact: row.fact })),
      error: null,
    })),
  }));
});
afterEach(() => vi.useRealTimers());
describe("manual entry", () => {
  it.each([null, { status: "published" }, { status: "draft" }])(
    "only regenerates existing Japanese content: %j",
    async (content) => {
      mocks.content.mockResolvedValue({ data: content, error: null });
      expect(
        await decideManualFactRegeneration({
          matchId: "match-id",
          contentType: "preview",
        }),
      ).toBe(content ? "regenerate" : "none");
      expect(mocks.eq).toHaveBeenCalledWith("language", "ja");
      expect(mocks.statuses).toHaveBeenCalledWith("status", [
        "published",
        "draft",
      ]);
    },
  );
  it.each([
    ["2026-10-17T04:00:00.000Z", "2026-10-16T12:00:00.000Z", "generate"],
    ["2026-10-17T04:00:00.000Z", "2026-10-16T05:00:00.000Z", "none"],
  ] as const)("decides first preview generation at the D030 boundary: %s", async (kickoff, current, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(current));
    mocks.match.mockResolvedValue({ data: { status: "scheduled", kickoff_at: kickoff }, error: null });
    expect(await decideManualFactRegeneration({ matchId: "match-id", contentType: "preview" })).toBe(expected);
  });
  it("does not generate a missing recap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T12:00:00.000Z"));
    expect(await decideManualFactRegeneration({ matchId: "match-id", contentType: "recap" })).toBe("none");
    expect(mocks.match).not.toHaveBeenCalled();
  });
  it("caps ops URL validation at four and preserves paste order and metadata", async () => {
    const pending: Array<() => void> = [];
    let active = 0;
    let peak = 0;
    mocks.validate.mockImplementation(
      (url: string) =>
        new Promise((resolve) => {
          active++;
          peak = Math.max(peak, active);
          pending.push(() => {
            active--;
            resolve({ ok: true, sourceDomain: new URL(url).hostname });
          });
        }),
    );
    const paste = {
      sources: Array.from({ length: 6 }, (_, i) => ({
        sourceUrl: `https://example.com/${i}`,
        facts: [{ fact: `事実${i}`, lineNumber: i + 1 }],
      })),
      skippedLines: [],
    };
    const promise = saveManualResearchFacts({
      matchId: "match-id",
      paste,
      entryPath: "ops_bulk_paste",
    });
    expect(active).toBe(4);
    expect(mocks.validate).toHaveBeenCalledTimes(4);
    pending[0]!();
    await vi.waitFor(() => expect(mocks.validate).toHaveBeenCalledTimes(5));
    pending[1]!();
    await vi.waitFor(() => expect(mocks.validate).toHaveBeenCalledTimes(6));
    for (const release of pending.slice(2)) release();
    const result = await promise;
    expect(result.savedCount).toBe(6);
    expect(peak).toBe(4);
    const [rows, options] = mocks.upsert.mock.calls[0]!;
    expect(
      rows.map(
        (row: { metadata: { paste_index: number } }) =>
          row.metadata.paste_index,
      ),
    ).toEqual([0, 1, 2, 3, 4, 5]);
    expect(rows[0]).toMatchObject({
      confidence: "high",
      model_version: "manual",
      content_type: "preview",
      metadata: { entry_path: "ops_bulk_paste" },
    });
    expect(options).toEqual({
      ignoreDuplicates: true,
      onConflict: "match_id,content_type,fact",
    });
  });
});
