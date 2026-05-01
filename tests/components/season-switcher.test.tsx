// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SeasonSwitcher } from "@/components/season-switcher";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const seasons = [{ season: "2025" }, { season: "2024" }, { season: "2023" }];

afterEach(() => {
  cleanup();
});

describe("SeasonSwitcher", () => {
  it("renders the current season as the active item", () => {
    render(
      <SeasonSwitcher
        competition="six-nations"
        currentSeason="2025"
        seasons={seasons}
      />,
    );

    const current = screen.getByText("2025");

    expect(screen.getByRole("list")).toHaveClass("overflow-x-auto");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveClass("bg-emerald-600", "text-white");
  });

  it("links non-current seasons to their season pages", () => {
    render(
      <SeasonSwitcher
        competition="six-nations"
        currentSeason="2025"
        seasons={seasons}
      />,
    );

    expect(screen.getByRole("link", { name: "2024" })).toHaveAttribute(
      "href",
      "/c/six-nations/2024",
    );
    expect(screen.getByRole("link", { name: "2023" })).toHaveAttribute(
      "href",
      "/c/six-nations/2023",
    );
  });

  it("does not render when there is only one season", () => {
    const { container } = render(
      <SeasonSwitcher
        competition="six-nations"
        currentSeason="2025"
        seasons={[{ season: "2025" }]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
