// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UserMenu } from "@/components/user-menu";

import type { User } from "@supabase/supabase-js";

const navigationMocks = vi.hoisted(() => ({
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("@/lib/auth/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signOut: vi.fn(),
    },
  }),
}));

vi.mock("next/navigation", () => navigationMocks);

vi.mock("@/components/notification-settings", () => ({
  NotificationSettings: () => <div>通知設定</div>,
}));

vi.mock("@/components/team-picker", () => ({
  TeamPicker: () => null,
}));

describe("UserMenu", () => {
  afterEach(() => {
    navigationMocks.useSearchParams.mockReturnValue(new URLSearchParams());
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps the signed-out login button at a 44px mobile tap target", () => {
    render(
      <UserMenu
        allTeams={[]}
        favoriteTeamSlugs={[]}
        isPremium={false}
        user={null}
      />,
    );

    expect(screen.getByRole("button", { name: "ログイン" })).toHaveClass(
      "min-h-[44px]",
      "sm:min-h-0",
    );
  });

  it("keeps the signed-in menu button at a 44px mobile tap target", () => {
    const user = {
      email: "fan@example.com",
      id: "user-1",
    } as User;

    render(
      <UserMenu
        allTeams={[]}
        favoriteTeamSlugs={[]}
        isPremium={false}
        user={user}
      />,
    );

    expect(screen.getByRole("button", { name: "fan" })).toHaveClass(
      "min-h-[44px]",
      "sm:min-h-0",
    );
  });

  it("opens notification settings from the notifications query parameter", async () => {
    navigationMocks.useSearchParams.mockReturnValue(
      new URLSearchParams("notifications=open"),
    );
    const user = {
      email: "fan@example.com",
      id: "user-1",
    } as User;

    render(
      <UserMenu
        allTeams={[]}
        favoriteTeamSlugs={[]}
        isPremium={false}
        user={user}
      />,
    );

    expect(await screen.findByText("通知設定")).toBeInTheDocument();
  });
});
