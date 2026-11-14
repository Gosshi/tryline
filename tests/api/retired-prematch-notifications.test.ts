import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ matches: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/cron/auth", () => ({
  assertCronAuthorized: vi.fn(),
  CronUnauthorizedError: class extends Error {},
}));
vi.mock("@/lib/db/queries/matches", () => ({
  getMatchesInRange: mocks.matches,
}));
vi.mock("@/lib/push/notifications", () => ({
  sendPrematchPushNotifications: mocks.send,
}));
import { GET } from "@/app/api/cron/send-prematch-notifications/route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.send.mockResolvedValue({ failedMatches: 0 });
});
it("excludes Top 14 from prematch push targets while retaining URC", async () => {
  const retired = { id: "retired", competition: { family: "top-14" } };
  const active = { id: "active", competition: { family: "urc" } };
  mocks.matches.mockResolvedValue([retired, active]);
  expect(
    (
      await GET(
        new Request("http://localhost/api/cron/send-prematch-notifications"),
      )
    ).status,
  ).toBe(200);
  expect(mocks.send).toHaveBeenCalledExactlyOnceWith([active]);
});
