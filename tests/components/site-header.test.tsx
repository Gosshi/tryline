// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SiteHeader } from "@/components/site-header";

vi.mock("@/lib/auth/server", () => ({
  getUserProfile: vi.fn(() => null),
  getUser: vi.fn(() => null),
}));

vi.mock("@/lib/db/queries/teams", () => ({
  listAllTeams: vi.fn(() => []),
}));

vi.mock("@/components/user-menu", () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

describe("SiteHeader", () => {
  it("does not render the dead standings anchor link", async () => {
    render(await SiteHeader());

    const matchesLink = screen.getByRole("link", { name: "試合" });

    expect(matchesLink).toHaveAttribute("href", "/");
    expect(matchesLink).toHaveClass("-my-1.5", "py-3", "sm:py-1.5");
    expect(screen.getByRole("button", { name: "大会" })).toHaveAttribute(
      "aria-haspopup",
      "listbox",
    );
    expect(screen.queryByRole("link", { name: "順位表" })).not.toBeInTheDocument();
  });
});
