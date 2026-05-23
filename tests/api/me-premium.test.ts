import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  getUser: vi.fn(),
  isPremium: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => authMock);

describe("/api/me/premium", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns false for unauthenticated users", async () => {
    authMock.getUser.mockResolvedValue(null);

    const { GET } = await import("@/app/api/me/premium/route");
    const response = await GET();
    const body = await response.json();

    expect(body).toEqual({ isPremium: false });
    expect(authMock.isPremium).not.toHaveBeenCalled();
  });

  it("returns premium status for authenticated users", async () => {
    authMock.getUser.mockResolvedValue({ id: "user-1" });
    authMock.isPremium.mockResolvedValue(true);

    const { GET } = await import("@/app/api/me/premium/route");
    const response = await GET();
    const body = await response.json();

    expect(body).toEqual({ isPremium: true });
    expect(authMock.isPremium).toHaveBeenCalledWith("user-1");
  });
});
