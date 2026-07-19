import { describe, expect, it, vi } from "vitest";

import { middleware } from "@/middleware";

import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getUser: vi.fn(),
  next: vi.fn(),
  set: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("next/server", () => ({
  NextResponse: { next: mocks.next },
}));

function createRequest(cookieNames: string[]): NextRequest {
  return {
    cookies: {
      getAll: () => cookieNames.map((name) => ({ name, value: "value" })),
      set: vi.fn(),
    },
  } as unknown as NextRequest;
}

describe("middleware auth scope", () => {
  it("skips Supabase auth for requests without an auth token cookie", async () => {
    mocks.next.mockReturnValue({ cookies: { set: mocks.set } });

    await middleware(createRequest(["theme", "analytics"]));

    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("refreshes a session when an @supabase/ssr auth cookie is present", async () => {
    mocks.next.mockReturnValue({ cookies: { set: mocks.set } });
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.createServerClient.mockReturnValue({
      auth: { getUser: mocks.getUser },
    });

    await middleware(createRequest(["sb-projectref-auth-token.0"]));

    expect(mocks.createServerClient).toHaveBeenCalledTimes(1);
    expect(mocks.getUser).toHaveBeenCalledTimes(1);
  });
});
