// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FavoriteTeamFollowButton } from "@/components/favorite-team-follow-button";

const routerMock = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

describe("FavoriteTeamFollowButton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    routerMock.refresh.mockReset();
  });

  it("adds a favorite team and tracks favorite_team_added", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    const gtag = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("gtag", gtag);
    Object.defineProperty(window, "gtag", {
      configurable: true,
      value: gtag,
    });

    render(
      <FavoriteTeamFollowButton
        initialFavoriteTeamSlugs={["france"]}
        source="test"
        teamName="Japan"
        teamSlug="japan"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Japanを追う" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      { body: string; method: string },
    ];
    expect(JSON.parse(init.body)).toEqual({
      favorite_team_slugs: ["france", "japan"],
    });
    expect(gtag).toHaveBeenCalledWith("event", "favorite_team_added", {
      source: "test",
      team_slug: "japan",
    });
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);
  });
});
