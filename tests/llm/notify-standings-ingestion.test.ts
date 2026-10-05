import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  in: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/env", async () => ({
  ...(await vi.importActual<typeof import("@/lib/env")>("@/lib/env")),
  getServerEnv: mocks.env,
}));
import { notifyStandingsIngestionIssue } from "@/lib/llm/notify";
const now = new Date("2026-10-05T12:00:00.000Z");
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  mocks.env.mockReturnValue({
    DISCORD_WEBHOOK_OPS: "https://example.invalid/ops-test",
  });
  const q = {
    select: mocks.select,
    in: mocks.in,
    order: mocks.order,
    limit: mocks.limit,
    maybeSingle: mocks.maybeSingle,
  };
  for (const fn of [
    mocks.from,
    mocks.select,
    mocks.in,
    mocks.order,
    mocks.limit,
  ])
    fn.mockReturnValue(q);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function payload() {
  return JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))
    .content as string;
}
describe("standings ingestion ops notification", () => {
  it.each([47, 48, 49])(
    "notifies only when the oldest pending kickoff is more than 48 hours old (%ih)",
    async (hours) => {
      mocks.maybeSingle.mockResolvedValue({
        data: {
          kickoff_at: new Date(now.getTime() - hours * 3600000).toISOString(),
        },
        error: null,
      });
      await notifyStandingsIngestionIssue({
        competition: "top-14-2026-27",
        status: "skipped",
        reason: "events_pending",
        pendingMatchIds: ["newer-match", "oldest-match"],
      });
      expect(mocks.from).toHaveBeenCalledWith("matches");
      expect(mocks.in).toHaveBeenCalledWith("id", [
        "newer-match",
        "oldest-match",
      ]);
      expect(mocks.order).toHaveBeenCalledWith("kickoff_at", {
        ascending: true,
      });
      expect(mocks.limit).toHaveBeenCalledWith(1);
      expect(fetch).toHaveBeenCalledTimes(hours > 48 ? 1 : 0);
      if (hours > 48) {
        expect(payload()).toContain("top-14-2026-27");
        expect(payload()).toContain("events_pending");
        expect(payload()).toContain("newer-match");
        expect(payload()).toContain("oldest-match");
      }
    },
  );
  it.each(["no_rows_parsed", "no_matches", "competition_not_found"])(
    "does not notify for %s",
    async (reason) => {
      await notifyStandingsIngestionIssue({
        competition: "pnc",
        status: "skipped",
        reason,
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );
  it("notifies a failed ingestion without querying match kickoffs", async () => {
    await notifyStandingsIngestionIssue({
      competition: "premiership",
      status: "failed",
      error: "Wikipedia unavailable",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(payload()).toContain("premiership");
    expect(payload()).toContain("failed");
    expect(payload()).toContain("Wikipedia unavailable");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not notify an updated table", async () => {
    await notifyStandingsIngestionIssue({
      competition: "top-14",
      status: "updated",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("logs a Discord send failure without rejecting", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("synthetic network error"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      notifyStandingsIngestionIssue({
        competition: "top-14",
        status: "failed",
        error: "calculation unavailable",
      }),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
  });
  it("logs a pending kickoff lookup failure without rejecting", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: new Error("synthetic DB error"),
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      notifyStandingsIngestionIssue({
        competition: "top-14",
        status: "skipped",
        reason: "events_pending",
        pendingMatchIds: ["match"],
      }),
    ).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
  });
});
