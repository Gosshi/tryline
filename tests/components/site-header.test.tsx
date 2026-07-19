// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SiteHeader } from "@/components/site-header";

const authServerMocks = vi.hoisted(() => ({
  getUser: vi.fn(() => null),
  getUserProfile: vi.fn(() => null),
  isProfilePremium: vi.fn(() => false),
}));

vi.mock("@/lib/auth/server", () => ({
  getUserProfile: authServerMocks.getUserProfile,
  getUser: authServerMocks.getUser,
  isProfilePremium: authServerMocks.isProfilePremium,
}));

vi.mock("@/lib/auth/client", () => ({
  getClientUserState: vi.fn().mockResolvedValue({
    favoriteTeamSlugs: [],
    isPremium: false,
    spoilerGuardEnabled: false,
    user: null,
  }),
}));

vi.mock("@/lib/db/queries/teams", () => ({
  listAllTeams: vi.fn(() => []),
}));

vi.mock("@/lib/db/queries/spoiler-guard", () => ({
  getSpoilerGuardEnabledForUser: vi.fn(() => false),
}));

vi.mock("@/components/user-menu", () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

describe("SiteHeader", () => {
  it("renders its static shell without server-side auth calls", async () => {
    render(await SiteHeader());

    expect(authServerMocks.getUser).not.toHaveBeenCalled();
    expect(authServerMocks.getUserProfile).not.toHaveBeenCalled();

    const matchesLink = screen.getByRole("link", { name: "試合" });

    expect(matchesLink).toHaveAttribute("href", "/");
    expect(matchesLink).toHaveClass("-my-1.5", "py-3", "sm:py-1.5");
    expect(screen.getByRole("button", { name: "大会" })).toHaveAttribute(
      "aria-haspopup",
      "listbox",
    );
    expect(screen.getByRole("link", { name: "カレンダー" })).toHaveAttribute(
      "href",
      "/calendar",
    );
    expect(
      screen.getByRole("button", { name: "メニューを開く" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("link", { name: "X (Twitter) @tryline_rugbyjp" }),
    ).toHaveAttribute("href", "https://x.com/tryline_rugbyjp");
    expect(
      screen.getByRole("link", { name: "X (Twitter) @tryline_rugbyjp" }),
    ).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("link", { name: "X (Twitter) @tryline_rugbyjp" }),
    ).toHaveAttribute("rel", "noopener noreferrer");
    expect(
      screen.getByRole("link", { name: "note @tryline_rugbyjp" }),
    ).toHaveAttribute("href", "https://note.com/tryline_rugbyjp");
    expect(
      screen.getByRole("link", { name: "note @tryline_rugbyjp" }),
    ).toHaveAttribute("target", "_blank");
    expect(
      screen.getByRole("link", { name: "note @tryline_rugbyjp" }),
    ).toHaveAttribute("rel", "noopener noreferrer");
    expect(
      screen.queryByRole("link", { name: "順位表" }),
    ).not.toBeInTheDocument();
  });
});
