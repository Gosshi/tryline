import { beforeEach, describe, expect, it, vi } from "vitest";

import { splitRecapForPaywall } from "@/lib/match-content/markdown";

const bearerMock = vi.hoisted(() => ({
  getSupabaseBearerClient: vi.fn(),
  getUserFromBearer: vi.fn(),
}));

const serverMock = vi.hoisted(() => ({
  getMobileUserProfile: vi.fn(),
}));

const contentMock = vi.hoisted(() => ({
  getPublishedContentForMatch: vi.fn(),
}));

const sampleMock = vi.hoisted(() => ({
  isSampleMatch: vi.fn(),
}));

vi.mock("@/lib/auth/bearer", () => bearerMock);
vi.mock("@/lib/api/v1/server", () => serverMock);
vi.mock("@/lib/db/queries/match-content", () => contentMock);
vi.mock("@/lib/sample-matches", () => sampleMock);

const LOCKED_SECRET = "PREMIUM_ONLY_SECRET_TEXT";
const recapMarkdown =
  "# この試合の核心\n\n無料の核心\n\n# 試合全体像\n\n無料の全体像\n\n# ターニングポイント\n\n" +
  LOCKED_SECRET +
  "\n\n# 次戦への示唆\n\n有料の示唆";

const preview = {
  contentMdJa: "# プレビュー\n\n公開プレビュー本文",
  contentType: "preview" as const,
  generatedAt: "2026-07-17T00:00:00.000Z",
  modelVersion: "gpt-4o",
  promptVersion: "preview@1.0.0",
};

const recap = {
  contentMdJa: recapMarkdown,
  contentType: "recap" as const,
  generatedAt: "2026-07-19T00:00:00.000Z",
  modelVersion: "gpt-4o",
  promptVersion: "recap@1.0.0",
};

describe("GET /api/v1/matches/[id]/content", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bearerMock.getUserFromBearer.mockResolvedValue(null);
    bearerMock.getSupabaseBearerClient.mockReturnValue({ id: "client" });
    serverMock.getMobileUserProfile.mockResolvedValue(null);
    contentMock.getPublishedContentForMatch.mockResolvedValue({
      preview,
      recap,
    });
    sampleMock.isSampleMatch.mockResolvedValue(false);
  });

  async function requestContent(authorization?: string) {
    const { GET } = await import("@/app/api/v1/matches/[id]/content/route");
    const response = await GET(
      new Request("http://localhost/api/v1/matches/match-1/content", {
        headers: authorization ? { Authorization: authorization } : undefined,
      }),
      { params: Promise.resolve({ id: "match-1" }) },
    );

    return response;
  }

  it("never includes locked Markdown in the anonymous response body", async () => {
    const response = await requestContent();
    const responseText = await response.text();
    const body = JSON.parse(responseText);

    expect(responseText).not.toContain(LOCKED_SECRET);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).toEqual({
      data: {
        isPremium: false,
        locked: true,
        preview: {
          content_md: preview.contentMdJa,
          content_type: "preview",
          generated_at: preview.generatedAt,
          model_version: preview.modelVersion,
          prompt_version: preview.promptVersion,
        },
        recap: {
          content_md: splitRecapForPaywall(recapMarkdown).freeMd,
          content_type: "recap",
          generated_at: recap.generatedAt,
          model_version: recap.modelVersion,
          prompt_version: recap.promptVersion,
        },
      },
      error: null,
      success: true,
    });
  });

  it("treats an invalid Bearer token as anonymous", async () => {
    bearerMock.getUserFromBearer.mockResolvedValue(null);

    const response = await requestContent("Bearer expired-token");
    const responseText = await response.text();

    expect(response.status).toBe(200);
    expect(responseText).not.toContain(LOCKED_SECRET);
    expect(serverMock.getMobileUserProfile).not.toHaveBeenCalled();
  });

  it("never includes locked Markdown for an authenticated free user", async () => {
    bearerMock.getUserFromBearer.mockResolvedValue({ id: "user-free" });
    serverMock.getMobileUserProfile.mockResolvedValue({
      displayName: "Free User",
      favoriteTeamSlugs: [],
      premiumUntil: null,
    });

    const response = await requestContent("Bearer free-token");
    const responseText = await response.text();
    const body = JSON.parse(responseText);

    expect(responseText).not.toContain(LOCKED_SECRET);
    expect(body.data.isPremium).toBe(false);
    expect(body.data.locked).toBe(true);
  });

  it("returns the full recap for a Premium user", async () => {
    bearerMock.getUserFromBearer.mockResolvedValue({ id: "user-premium" });
    serverMock.getMobileUserProfile.mockResolvedValue({
      displayName: "Premium User",
      favoriteTeamSlugs: [],
      premiumUntil: "2999-01-01T00:00:00.000Z",
    });

    const response = await requestContent("Bearer premium-token");
    const responseText = await response.text();
    const body = JSON.parse(responseText);

    expect(responseText).toContain(LOCKED_SECRET);
    expect(body.data.isPremium).toBe(true);
    expect(body.data.locked).toBe(false);
    expect(body.data.recap.content_md).toBe(recapMarkdown);
  });

  it("returns the full recap for the Web free-sample match", async () => {
    sampleMock.isSampleMatch.mockResolvedValue(true);

    const response = await requestContent();
    const body = await response.json();

    expect(body.data.isPremium).toBe(false);
    expect(body.data.locked).toBe(false);
    expect(body.data.recap.content_md).toBe(recapMarkdown);
  });

  it("returns 200 with null preview and recap when nothing is published", async () => {
    contentMock.getPublishedContentForMatch.mockResolvedValue({
      preview: null,
      recap: null,
    });

    const response = await requestContent();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        isPremium: false,
        locked: false,
        preview: null,
        recap: null,
      },
      error: null,
      success: true,
    });
  });
});
