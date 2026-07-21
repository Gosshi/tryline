// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { HeaderUserControls } from "@/components/header-user-controls";

import type { User } from "@supabase/supabase-js";

const authClientMocks = vi.hoisted(() => ({
  getClientUserState: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({
  getClientUserState: authClientMocks.getClientUserState,
  getSupabaseBrowserClient: vi.fn(),
}));

vi.mock("@/components/team-picker", () => ({
  TeamPicker: () => null,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe("HeaderUserControls", () => {
  it("shows the signed-in user's premium badge and favorite teams after loading", async () => {
    authClientMocks.getClientUserState.mockResolvedValue({
      favoriteTeamSlugs: ["japan"],
      isPremium: true,
      spoilerGuardEnabled: true,
      user: { email: "fan@example.com", id: "user-1" } as User,
    });

    render(
      <HeaderUserControls
        allTeams={[{ country: "JPN", name: "日本", slug: "japan" }]}
      />,
    );

    const menuButton = await screen.findByRole("button", { name: /fan/ });

    expect(screen.getByText("Premium")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "料金" }),
    ).not.toBeInTheDocument();

    fireEvent.click(menuButton);

    expect(
      screen.getByRole("link", { name: "日本 のページ →" }),
    ).toHaveAttribute("href", "/teams/japan");
  });
});
