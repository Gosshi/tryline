// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TeamBadge } from "@/components/team-badge";

describe("TeamBadge", () => {
  it("reuses existing SVG flags for international teams with inline SVGs", () => {
    const { container } = render(
      <TeamBadge shortCode="FRA" size={28} slug="france" />,
    );

    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container.querySelector("span")).toHaveStyle({
      height: "28px",
      width: "28px",
    });
    expect(screen.queryByRole("img", { name: "FRA" })).not.toBeInTheDocument();
  });

  it("keeps existing emoji flags for international teams without inline SVGs", () => {
    render(<TeamBadge shortCode="NZL" size={28} slug="new-zealand" />);

    expect(screen.getByText("🇳🇿")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "NZL" })).not.toBeInTheDocument();
  });

  it("renders a generated club badge with dark text on light colors", () => {
    render(<TeamBadge shortCode="HIG" size={32} slug="highlanders" />);
    const badge = screen.getByRole("img", { name: "HIG" });

    expect(badge).toHaveAttribute("viewBox", "0 0 32 32");
    expect(badge.querySelector("circle")).toHaveAttribute(
      "fill",
      "url(#badge-highlanders)",
    );
    expect(badge.querySelector("text")).toHaveAttribute("fill", "#111111");
  });

  it("renders a generated club badge with white text on dark colors", () => {
    render(<TeamBadge shortCode="SAR" size={32} slug="saracens" />);
    const badge = screen.getByRole("img", { name: "SAR" });

    expect(badge.querySelector("text")).toHaveAttribute("fill", "#FFFFFF");
  });
});
