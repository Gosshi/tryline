import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  getUser: vi.fn(),
  isPremium: vi.fn(),
}));

const matchContentMock = vi.hoisted(() => ({
  getPublishedContentForMatch: vi.fn(),
}));

const matchesMock = vi.hoisted(() => ({
  getMatchContentEn: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => authMock);
vi.mock("@/lib/db/queries/match-content", () => matchContentMock);
vi.mock("@/lib/db/queries/matches", () => matchesMock);

const jaRecap = {
  contentMdJa:
    "# この試合の核心\n\n核心本文\n\n# 試合全体像\n\n全体像本文\n\n# ターニングポイント\n\n有料本文\n\n# 次戦への示唆\n\n締め",
  contentType: "recap" as const,
  generatedAt: "2026-06-01T00:00:00.000Z",
  modelVersion: "gpt-4o",
  promptVersion: "recap@4.9.0",
};

const enRecap = {
  ...jaRecap,
  contentMdJa:
    "# Core question\n\nFree body.\n\n# Match shape\n\nFree shape.\n\n# Turning point\n\nLocked English body.",
};

describe("/api/matches/[id]/recap-locked", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    matchContentMock.getPublishedContentForMatch.mockResolvedValue({
      preview: null,
      recap: jaRecap,
    });
    matchesMock.getMatchContentEn.mockResolvedValue({
      preview: null,
      recap: enRecap,
    });
  });

  it("returns no locked markdown for unauthenticated users", async () => {
    authMock.getUser.mockResolvedValue(null);

    const { GET } = await import("@/app/api/matches/[id]/recap-locked/route");
    const response = await GET(
      new Request("http://localhost/api/matches/match-1/recap-locked"),
      { params: Promise.resolve({ id: "match-1" }) },
    );

    expect(await response.json()).toEqual({
      isPremium: false,
      lockedMd: null,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(authMock.isPremium).not.toHaveBeenCalled();
    expect(matchContentMock.getPublishedContentForMatch).not.toHaveBeenCalled();
  });

  it("returns no locked markdown for free users", async () => {
    authMock.getUser.mockResolvedValue({ id: "user-1" });
    authMock.isPremium.mockResolvedValue(false);

    const { GET } = await import("@/app/api/matches/[id]/recap-locked/route");
    const response = await GET(
      new Request("http://localhost/api/matches/match-1/recap-locked"),
      { params: Promise.resolve({ id: "match-1" }) },
    );

    expect(await response.json()).toEqual({
      isPremium: false,
      lockedMd: null,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(matchContentMock.getPublishedContentForMatch).not.toHaveBeenCalled();
  });

  it("returns only the locked Japanese recap markdown for premium users", async () => {
    authMock.getUser.mockResolvedValue({ id: "user-1" });
    authMock.isPremium.mockResolvedValue(true);

    const { GET } = await import("@/app/api/matches/[id]/recap-locked/route");
    const response = await GET(
      new Request("http://localhost/api/matches/match-1/recap-locked?lang=ja"),
      { params: Promise.resolve({ id: "match-1" }) },
    );

    expect(await response.json()).toEqual({
      isPremium: true,
      lockedMd: "# ターニングポイント\n\n有料本文\n\n# 次戦への示唆\n\n締め",
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(matchContentMock.getPublishedContentForMatch).toHaveBeenCalledWith(
      "match-1",
    );
  });

  it("returns only the locked English recap markdown for premium users", async () => {
    authMock.getUser.mockResolvedValue({ id: "user-1" });
    authMock.isPremium.mockResolvedValue(true);

    const { GET } = await import("@/app/api/matches/[id]/recap-locked/route");
    const response = await GET(
      new Request("http://localhost/api/matches/match-1/recap-locked?lang=en"),
      { params: Promise.resolve({ id: "match-1" }) },
    );

    expect(await response.json()).toEqual({
      isPremium: true,
      lockedMd: "# Turning point\n\nLocked English body.",
    });
    expect(matchesMock.getMatchContentEn).toHaveBeenCalledWith("match-1");
  });
});
