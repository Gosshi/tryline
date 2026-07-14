import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  eq: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ from: dbMocks.from })),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: vi.fn(() => []),
    set: vi.fn(),
  })),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { isPremium, isProfilePremium } from "@/lib/auth/server";

describe("premium entitlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    dbMocks.from.mockReturnValue({ select: dbMocks.select });
    dbMocks.select.mockReturnValue({ eq: dbMocks.eq });
    dbMocks.eq.mockReturnValue({ maybeSingle: dbMocks.maybeSingle });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true from isPremium when premium_until is in the future", async () => {
    dbMocks.maybeSingle.mockResolvedValue({
      data: { premium_until: "2027-01-01T00:00:00.000Z" },
    });
    vi.setSystemTime(new Date("2026-07-14T00:00:00.000Z"));

    await expect(isPremium("user-1")).resolves.toBe(true);
    expect(dbMocks.select).toHaveBeenCalledWith(
      expect.stringContaining("premium_until"),
    );
  });

  it.each([
    ["an expired entitlement", "2026-01-01T00:00:00.000Z"],
    ["a missing entitlement", null],
  ])("returns false for %s", async (_label, premiumUntil) => {
    dbMocks.maybeSingle.mockResolvedValue({
      data: { premium_until: premiumUntil },
    });
    vi.setSystemTime(new Date("2026-07-14T00:00:00.000Z"));

    await expect(isPremium("user-1")).resolves.toBe(false);
  });

  it("uses the same premium_until boundary for profile-based gating", () => {
    const now = new Date("2026-07-14T00:00:00.000Z");

    expect(
      isProfilePremium({ premium_until: "2026-07-14T00:00:00.001Z" }, now),
    ).toBe(true);
    expect(
      isProfilePremium({ premium_until: "2026-07-14T00:00:00.000Z" }, now),
    ).toBe(false);
    expect(isProfilePremium({ premium_until: null }, now)).toBe(false);
  });
});
