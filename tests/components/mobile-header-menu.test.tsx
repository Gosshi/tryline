// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MobileHeaderMenu } from "@/components/mobile-header-menu";

vi.mock("@/components/user-menu", () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

vi.mock("@/lib/auth/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signInWithOAuth: vi.fn(),
      signInWithOtp: vi.fn(),
    },
  }),
}));

describe("MobileHeaderMenu", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens and closes the mobile drawer", () => {
    render(
      <MobileHeaderMenu
        allTeams={[]}
        favoriteTeamSlugs={[]}
        isPremium={false}
        user={null}
      />,
    );

    const toggle = screen.getByRole("button", { name: "メニューを開く" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);

    expect(screen.getByRole("navigation", { name: "モバイルナビゲーション" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "メニューを閉じる" }),
    ).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "メニューを閉じる" }));
    expect(
      screen.queryByRole("navigation", { name: "モバイルナビゲーション" }),
    ).not.toBeInTheDocument();
  });

  it("opens the login modal from the drawer", async () => {
    render(
      <MobileHeaderMenu
        allTeams={[]}
        favoriteTeamSlugs={[]}
        isPremium={false}
        user={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "メニューを開く" }));
    fireEvent.click(screen.getByRole("button", { name: "ログイン" }));

    expect(
      await screen.findByRole("heading", { name: "ログイン" }),
    ).toBeInTheDocument();
  });
});
