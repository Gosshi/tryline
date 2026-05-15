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
    expect(badge).toHaveAttribute("width", "32");
    expect(badge).toHaveAttribute("height", "32");
    expect(badge.querySelector("linearGradient")).toHaveAttribute("x1", "0");
    expect(badge.querySelector("linearGradient")).toHaveAttribute("x2", "1");
    expect(badge.querySelector("linearGradient")).toHaveAttribute("y1", "0");
    expect(badge.querySelector("linearGradient")).toHaveAttribute("y2", "0");
    expect(badge.querySelector("circle")).not.toBeInTheDocument();
    expect(badge.querySelector("path")).toHaveAttribute(
      "d",
      "M16 2 L29 7 L29 18.5 Q29 27 16 31 Q3 27 3 18.5 L3 7 Z",
    );
    expect(badge.querySelector("path")).toHaveAttribute(
      "fill",
      "url(#badge-highlanders)",
    );
    expect(badge.querySelector("text")).toHaveAttribute("fill", "#111111");
    expect(badge.querySelector("text")).toHaveAttribute("y", "17");
  });

  it("renders a generated club badge with white text on dark colors", () => {
    render(<TeamBadge shortCode="SAR" size={32} slug="saracens" />);
    const badge = screen.getByRole("img", { name: "SAR" });

    expect(badge.querySelector("text")).toHaveAttribute("fill", "#FFFFFF");
  });

  it("renders Harlequins as four vertical stripe stops", () => {
    render(<TeamBadge shortCode="HAR" size={48} slug="harlequins" />);
    const badge = screen.getByRole("img", { name: "HAR" });
    const stops = [...badge.querySelectorAll("stop")].map((stop) =>
      stop.getAttribute("stop-color"),
    );

    expect(badge).toHaveAttribute("width", "48");
    expect(badge).toHaveAttribute("height", "48");
    expect(stops).toEqual([
      "#1E7F3B",
      "#1E7F3B",
      "#003087",
      "#003087",
      "#FFD100",
      "#FFD100",
      "#E91E8F",
      "#E91E8F",
    ]);
  });
});
