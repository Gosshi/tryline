import { beforeEach, describe, expect, it, vi } from "vitest";

const playerMocks = vi.hoisted(() => ({
  getMatchesForPlayer: vi.fn(),
  getPlayerCareerStats: vi.fn(),
  getPlayerBySlug: vi.fn(),
  isIndexablePlayer: vi.fn(),
}));

vi.mock("@/lib/db/queries/players", () => playerMocks);

import { generateMetadata } from "@/app/players/[slug]/page";

const player = {
  aliasTeams: [],
  canonicalSlug: null,
  hasPublishedContentMatch: true,
  id: "player-1",
  name: "Finn Russell",
  position: "Fly-half",
  slug: "finn-russell",
  teamName: "Bath",
  teamSlug: "bath",
};

describe("player page metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playerMocks.getPlayerBySlug.mockResolvedValue(player);
  });

  it("omits robots noindex for indexable players", async () => {
    playerMocks.isIndexablePlayer.mockReturnValue(true);

    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "finn-russell" }) }),
    ).resolves.toMatchObject({
      description: "Finn Russell（Bath）の出場試合・スタッツ一覧。",
      title: "Finn Russell — Bath",
    });

    await expect(
      generateMetadata({ params: Promise.resolve({ slug: "finn-russell" }) }),
    ).resolves.not.toHaveProperty("robots");
  });

  it("returns noindex,follow for non-indexable players", async () => {
    playerMocks.isIndexablePlayer.mockReturnValue(false);

    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: "player-1234abcd" }),
      }),
    ).resolves.toMatchObject({
      robots: {
        follow: true,
        index: false,
      },
    });
  });
});
