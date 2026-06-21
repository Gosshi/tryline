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

    expect(
      screen.getByRole("navigation", { name: "モバイルナビゲーション" }),
    ).toBeInTheDocument();
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
    expect(screen.getByRole("link", { name: "カレンダー" })).toHaveAttribute(
      "href",
      "/calendar",
    );
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

  it("shows evergreen Japanese competition hub links", () => {
    render(
      <MobileHeaderMenu
        allTeams={[]}
        favoriteTeamSlugs={[]}
        isPremium={false}
        user={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "メニューを開く" }));
    fireEvent.click(screen.getByRole("button", { name: "大会" }));

    expect(
      screen.getByRole("link", { name: "シックスネイションズ" }),
    ).toHaveAttribute("href", "/c/six-nations");
    expect(
      screen.getByRole("link", { name: "ラグビーワールドカップ" }),
    ).toHaveAttribute("href", "/c/rwc");
    expect(
      screen.getByRole("link", {
        name: "パシフィック・ネーションズカップ",
      }),
    ).toHaveAttribute("href", "/c/pnc");
  });
});
