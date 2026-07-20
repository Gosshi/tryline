// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HomepageFavoriteTeams,
  HomepageUserStateProvider,
} from "@/components/home-user-state";

import type { User } from "@supabase/supabase-js";

const authClientMocks = vi.hoisted(() => ({
  getClientUserState: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({
  getClientUserState: authClientMocks.getClientUserState,
}));

vi.mock("@/components/match-card", () => ({
  MatchCard: ({ match }: { match: { id: string } }) => <div>{match.id}</div>,
}));

describe("HomepageFavoriteTeams", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads and shows favorite team matches after client-side session resolution", async () => {
    authClientMocks.getClientUserState.mockResolvedValue({
      favoriteTeamSlugs: ["japan"],
      isPremium: true,
      spoilerGuardEnabled: false,
      user: { email: "fan@example.com", id: "user-1" } as User,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({
          matches: [
            {
              awayScore: null,
              awayTeam: { name: "France", shortCode: "FRA", slug: "france" },
              competition: {
                family: "six-nations",
                name: "Six Nations",
                season: "2027",
                slug: "six-nations-2027",
              },
              homeScore: null,
              homeTeam: { name: "Japan", shortCode: "JPN", slug: "japan" },
              id: "japan-france",
              kickoffAt: "2027-02-06T05:00:00.000Z",
              poolName: null,
              round: null,
              roundName: null,
              status: "scheduled",
              venue: null,
            },
          ],
        }),
        ok: true,
      }),
    );

    render(
      <HomepageUserStateProvider>
        <HomepageFavoriteTeams allTeams={[]} />
      </HomepageUserStateProvider>,
    );

    expect(await screen.findByText("応援チームの試合")).toBeInTheDocument();
    expect(screen.getByText("japan-france")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "チームページ →" })).toHaveAttribute(
      "href",
      "/teams/japan",
    );
  });
});
