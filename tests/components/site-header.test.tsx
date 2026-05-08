// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SiteHeader } from "@/components/site-header";

vi.mock("@/lib/auth/server", () => ({
  getUser: vi.fn(() => null),
  isPremium: vi.fn(() => false),
}));

vi.mock("@/components/user-menu", () => ({
  UserMenu: () => <div data-testid="user-menu" />,
}));

describe("SiteHeader", () => {
  it("does not render the dead standings anchor link", async () => {
    render(await SiteHeader());

    expect(screen.getByRole("link", { name: "試合" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.queryByRole("link", { name: "順位表" })).not.toBeInTheDocument();
  });
});
