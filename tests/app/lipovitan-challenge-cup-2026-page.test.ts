import { describe, expect, it, vi } from "vitest";

import LipovitanChallengeCup2026LegacyPage from "@/app/c/lipovitan-challenge-cup-2026/page";

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => navigationMocks);

describe("Lipovitan Challenge Cup 2026 legacy page", () => {
  it("redirects the competition-slug URL to the canonical season page", () => {
    LipovitanChallengeCup2026LegacyPage();

    expect(navigationMocks.redirect).toHaveBeenCalledWith(
      "/c/lipovitan-challenge-cup/2026",
    );
  });
});
