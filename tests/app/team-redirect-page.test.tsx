import { beforeEach, describe, expect, it, vi } from "vitest";

const teamMocks = vi.hoisted(() => ({
  getTeamBySlug: vi.fn(),
}));

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  permanentRedirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/db/queries/teams", () => teamMocks);
vi.mock("next/navigation", () => navigationMocks);

import TeamRedirectPage from "@/app/t/[team]/page";

describe("legacy team route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects /t/team to the canonical /teams/team URL", async () => {
    teamMocks.getTeamBySlug.mockResolvedValue({
      country: "ENG",
      name: "Bath",
      shortCode: "BAT",
      slug: "bath",
    });

    await expect(
      TeamRedirectPage({ params: Promise.resolve({ team: "bath" }) }),
    ).rejects.toThrow("NEXT_REDIRECT:/teams/bath");
  });

  it("keeps unknown teams as notFound", async () => {
    teamMocks.getTeamBySlug.mockResolvedValue(null);

    await expect(
      TeamRedirectPage({ params: Promise.resolve({ team: "unknown" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
