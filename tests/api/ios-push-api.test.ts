import { beforeEach, describe, expect, it, vi } from "vitest";

const bearerMock = vi.hoisted(() => ({
  getUserFromBearer: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  deleteEq: vi.fn(),
  deleteFrom: vi.fn(),
  deleteBuilder: vi.fn(),
  from: vi.fn(),
  getSupabaseServerClient: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/auth/bearer", () => bearerMock);
vi.mock("@/lib/db/server", () => ({
  getSupabaseServerClient: dbMock.getSupabaseServerClient,
}));

function jsonRequest(path: string, body: unknown, authorization?: string) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/push/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bearerMock.getUserFromBearer.mockResolvedValue(null);
    dbMock.upsert.mockResolvedValue({ error: null });
    dbMock.from.mockReturnValue({ upsert: dbMock.upsert });
    dbMock.getSupabaseServerClient.mockReturnValue({ from: dbMock.from });
  });

  it("upserts a valid anonymous Expo token", async () => {
    const { POST } = await import("@/app/api/v1/push/register/route");
    const response = await POST(
      jsonRequest("/api/v1/push/register", {
        token: "ExponentPushToken[abc123]",
        team_slugs: ["japan", "france"],
        notify_prematch: true,
        notify_content: false,
        spoiler_guard: true,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(dbMock.from).toHaveBeenCalledWith("expo_push_tokens");
    expect(dbMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "ExponentPushToken[abc123]",
        user_id: null,
        team_slugs: ["japan", "france"],
        notify_prematch: true,
        notify_content: false,
        spoiler_guard: true,
      }),
      { onConflict: "token" },
    );
    expect(await response.json()).toEqual({
      data: { registered: true },
      error: null,
      success: true,
    });
  });

  it("stores user_id when a valid Bearer token is present", async () => {
    bearerMock.getUserFromBearer.mockResolvedValue({ id: "user-1" });

    const { POST } = await import("@/app/api/v1/push/register/route");
    const response = await POST(
      jsonRequest(
        "/api/v1/push/register",
        {
          token: "ExponentPushToken[user-token]",
          team_slugs: ["japan"],
        },
        "Bearer valid-access-token",
      ),
    );

    expect(response.status).toBe(200);
    expect(dbMock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "ExponentPushToken[user-token]",
        user_id: "user-1",
        notify_prematch: true,
        notify_content: true,
        spoiler_guard: true,
      }),
      { onConflict: "token" },
    );
  });

  it("rejects invalid token format and too many team slugs", async () => {
    const { POST } = await import("@/app/api/v1/push/register/route");
    const invalidToken = await POST(
      jsonRequest("/api/v1/push/register", {
        token: "invalid",
        team_slugs: ["japan"],
      }),
    );
    const tooManyTeams = await POST(
      jsonRequest("/api/v1/push/register", {
        token: "ExponentPushToken[abc123]",
        team_slugs: Array.from({ length: 11 }, (_, index) => `team-${index}`),
      }),
    );

    expect(invalidToken.status).toBe(400);
    expect(tooManyTeams.status).toBe(400);
    expect(dbMock.upsert).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/push/unregister", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.deleteEq.mockResolvedValue({ error: null });
    dbMock.deleteBuilder.mockReturnValue({ eq: dbMock.deleteEq });
    dbMock.from.mockReturnValue({ delete: dbMock.deleteBuilder });
    dbMock.getSupabaseServerClient.mockReturnValue({ from: dbMock.from });
  });

  it("deletes the token and returns 200 even when the row is absent", async () => {
    const { POST } = await import("@/app/api/v1/push/unregister/route");
    const response = await POST(
      jsonRequest("/api/v1/push/unregister", {
        token: "ExponentPushToken[abc123]",
      }),
    );

    expect(response.status).toBe(200);
    expect(dbMock.from).toHaveBeenCalledWith("expo_push_tokens");
    expect(dbMock.deleteEq).toHaveBeenCalledWith(
      "token",
      "ExponentPushToken[abc123]",
    );
    expect(await response.json()).toEqual({
      data: { unregistered: true },
      error: null,
      success: true,
    });
  });

  it("rejects invalid token format", async () => {
    const { POST } = await import("@/app/api/v1/push/unregister/route");
    const response = await POST(
      jsonRequest("/api/v1/push/unregister", { token: "invalid" }),
    );

    expect(response.status).toBe(400);
    expect(dbMock.deleteEq).not.toHaveBeenCalled();
  });
});
