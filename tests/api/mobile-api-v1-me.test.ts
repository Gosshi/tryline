import { beforeEach, describe, expect, it, vi } from "vitest";

const bearerMock = vi.hoisted(() => ({
  getSupabaseBearerClient: vi.fn(),
  getUserFromBearer: vi.fn(),
}));

const serverMock = vi.hoisted(() => ({
  getMobileUserProfile: vi.fn(),
}));

const adminMock = vi.hoisted(() => ({
  createClient: vi.fn(),
  deleteUser: vi.fn(),
  from: vi.fn(),
  profileEq: vi.fn(),
  profileMaybeSingle: vi.fn(),
  profileSelect: vi.fn(),
}));

vi.mock("@/lib/auth/bearer", () => bearerMock);
vi.mock("@/lib/api/v1/server", () => serverMock);
vi.mock("@supabase/supabase-js", () => ({
  createClient: adminMock.createClient,
}));

type ClientOptions = {
  teamData?: Array<{ slug: string }>;
  teamError?: Error | null;
  updateError?: Error | null;
};

function createClient(options: ClientOptions = {}) {
  const teamIn = vi.fn().mockResolvedValue({
    data: options.teamData ?? [],
    error: options.teamError ?? null,
  });
  const teamSelect = vi.fn(() => ({ in: teamIn }));
  const profileEq = vi.fn().mockResolvedValue({
    error: options.updateError ?? null,
  });
  const profileUpdate = vi.fn(() => ({ eq: profileEq }));
  const from = vi.fn((table: string) => {
    if (table === "teams") {
      return { select: teamSelect };
    }

    if (table === "user_profiles") {
      return { update: profileUpdate };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: { from },
    from,
    profileEq,
    profileUpdate,
    teamIn,
  };
}

describe("GET /api/v1/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bearerMock.getUserFromBearer.mockResolvedValue(null);
    bearerMock.getSupabaseBearerClient.mockReturnValue(null);
  });

  it("returns 401 without a valid Bearer token", async () => {
    const { GET } = await import("@/app/api/v1/me/route");
    const response = await GET(new Request("http://localhost/api/v1/me"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      data: null,
      error: "unauthorized",
      success: false,
    });
    expect(adminMock.createClient).not.toHaveBeenCalled();
  });

  it("returns the profile and entitlement for a valid Bearer token", async () => {
    const { client } = createClient();
    bearerMock.getUserFromBearer.mockResolvedValue({ id: "user-1" });
    bearerMock.getSupabaseBearerClient.mockReturnValue(client);
    serverMock.getMobileUserProfile.mockResolvedValue({
      displayName: "Gota",
      favoriteTeamSlugs: ["japan", "france"],
      premiumUntil: "2999-01-01T00:00:00.000Z",
    });

    const { GET } = await import("@/app/api/v1/me/route");
    const response = await GET(
      new Request("http://localhost/api/v1/me", {
        headers: { Authorization: "Bearer valid-token" },
      }),
    );

    expect(response.status).toBe(200);
    expect(serverMock.getMobileUserProfile).toHaveBeenCalledWith(
      client,
      "user-1",
    );
    expect(await response.json()).toEqual({
      data: {
        display_name: "Gota",
        favorite_team_slugs: ["japan", "france"],
        isPremium: true,
        premium_until: "2999-01-01T00:00:00.000Z",
      },
      error: null,
      success: true,
    });
  });

  it("returns a null premium_until for a non-Premium profile", async () => {
    const { client } = createClient();
    bearerMock.getUserFromBearer.mockResolvedValue({ id: "user-1" });
    bearerMock.getSupabaseBearerClient.mockReturnValue(client);
    serverMock.getMobileUserProfile.mockResolvedValue({
      displayName: "Gota",
      favoriteTeamSlugs: [],
      premiumUntil: "2020-01-01T00:00:00.000Z",
    });

    const { GET } = await import("@/app/api/v1/me/route");
    const response = await GET(
      new Request("http://localhost/api/v1/me", {
        headers: { Authorization: "Bearer valid-token" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        display_name: "Gota",
        favorite_team_slugs: [],
        isPremium: false,
        premium_until: null,
      },
      error: null,
      success: true,
    });
  });
});

describe("DELETE /api/v1/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bearerMock.getUserFromBearer.mockResolvedValue({ id: "user-1" });
    adminMock.profileMaybeSingle.mockResolvedValue({
      data: { stripe_subscription_id: null },
      error: null,
    });
    adminMock.profileEq.mockReturnValue({
      maybeSingle: adminMock.profileMaybeSingle,
    });
    adminMock.profileSelect.mockReturnValue({ eq: adminMock.profileEq });
    adminMock.from.mockReturnValue({ select: adminMock.profileSelect });
    adminMock.deleteUser.mockResolvedValue({ error: null });
    adminMock.createClient.mockReturnValue({
      auth: { admin: { deleteUser: adminMock.deleteUser } },
      from: adminMock.from,
    });
  });

  async function deleteAccount(authorization?: string) {
    const { DELETE } = await import("@/app/api/v1/me/route");

    return DELETE(
      new Request("http://localhost/api/v1/me", {
        headers: authorization ? { Authorization: authorization } : undefined,
        method: "DELETE",
      }),
    );
  }

  it.each([undefined, "Bearer invalid-token"])(
    "returns 401 without a valid Bearer token",
    async (authorization) => {
      bearerMock.getUserFromBearer.mockResolvedValue(null);

      const response = await deleteAccount(authorization);

      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.json()).toEqual({
        data: null,
        error: "unauthorized",
        success: false,
      });
      expect(adminMock.createClient).not.toHaveBeenCalled();
    },
  );

  it("deletes the authenticated user and returns the shared envelope", async () => {
    const response = await deleteAccount("Bearer valid-token");

    expect(adminMock.profileSelect).toHaveBeenCalledWith(
      "stripe_subscription_id",
    );
    expect(adminMock.profileEq).toHaveBeenCalledWith("id", "user-1");
    expect(adminMock.deleteUser).toHaveBeenCalledWith("user-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      data: { deleted: true },
      error: null,
      success: true,
    });
  });

  it("returns the Supabase error without destroying the local session", async () => {
    adminMock.deleteUser.mockResolvedValue({
      error: { message: "failed to delete auth user" },
    });

    const response = await deleteAccount("Bearer valid-token");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      data: null,
      error: "failed to delete auth user",
      success: false,
    });
    expect(bearerMock.getSupabaseBearerClient).not.toHaveBeenCalled();
  });

  it("warns but still deletes a user with a Stripe subscription", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    adminMock.profileMaybeSingle.mockResolvedValue({
      data: { stripe_subscription_id: "sub_test" },
      error: null,
    });

    const response = await deleteAccount("Bearer valid-token");

    expect(response.status).toBe(200);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("subscription was not cancelled"),
    );
    expect(adminMock.deleteUser).toHaveBeenCalledWith("user-1");
    warn.mockRestore();
  });
});

describe("PUT /api/v1/me/favorites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bearerMock.getUserFromBearer.mockResolvedValue({ id: "user-1" });
  });

  async function put(body: BodyInit | null, contentType = "application/json") {
    const { PUT } = await import("@/app/api/v1/me/favorites/route");

    return PUT(
      new Request("http://localhost/api/v1/me/favorites", {
        body,
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": contentType,
        },
        method: "PUT",
      }),
    );
  }

  it("returns 401 when the Bearer token is invalid", async () => {
    bearerMock.getUserFromBearer.mockResolvedValue(null);
    bearerMock.getSupabaseBearerClient.mockReturnValue(null);

    const response = await put(JSON.stringify({ favorite_team_slugs: [] }));

    expect(response.status).toBe(401);
    expect((await response.json()).success).toBe(false);
  });

  it.each([
    ["not-json", "invalid JSON body"],
    [JSON.stringify({ favorite_team_slugs: "japan" }), "must be an array"],
    [JSON.stringify({ favorite_team_slugs: ["japan", 1] }), "only strings"],
    [
      JSON.stringify({
        favorite_team_slugs: ["japan", "france", "ireland", "italy"],
      }),
      "at most 3",
    ],
  ])("returns 400 for an invalid body", async (body, errorFragment) => {
    const { client } = createClient();
    bearerMock.getSupabaseBearerClient.mockReturnValue(client);

    const response = await put(body);
    const responseBody = await response.json();

    expect(response.status).toBe(400);
    expect(responseBody).toEqual({
      data: null,
      error: expect.stringContaining(errorFragment),
      success: false,
    });
  });

  it("rejects unknown team slugs", async () => {
    const { client } = createClient({ teamData: [{ slug: "japan" }] });
    bearerMock.getSupabaseBearerClient.mockReturnValue(client);

    const response = await put(
      JSON.stringify({ favorite_team_slugs: ["japan", "unknown"] }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("unknown");
  });

  it("updates favorite_team_slugs and returns the shared envelope", async () => {
    const { client, profileEq, profileUpdate, teamIn } = createClient({
      teamData: [{ slug: "japan" }, { slug: "france" }],
    });
    bearerMock.getSupabaseBearerClient.mockReturnValue(client);

    const response = await put(
      JSON.stringify({ favorite_team_slugs: ["japan", "france"] }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(teamIn).toHaveBeenCalledWith("slug", ["japan", "france"]);
    expect(profileUpdate).toHaveBeenCalledWith({
      favorite_team_slugs: ["japan", "france"],
    });
    expect(profileEq).toHaveBeenCalledWith("id", "user-1");
    expect(await response.json()).toEqual({
      data: { favorite_team_slugs: ["japan", "france"] },
      error: null,
      success: true,
    });
  });
});
