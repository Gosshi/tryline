// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RoundHeading } from "@/components/round-heading";

describe("RoundHeading", () => {
  it("renders the round label with editorial display styles", () => {
    render(<RoundHeading round={1} />);

    expect(screen.getByText("Round 1")).toHaveClass(
      "font-display",
      "text-xs",
      "tracking-[0.2em]",
      "text-[var(--color-ink-muted)]",
    );
  });

  it("renders dividers on both sides", () => {
    const { container } = render(<RoundHeading round={null} />);

    expect(screen.getByText("節未定")).toBeInTheDocument();
    const dividers = container.querySelectorAll(".h-px");

    expect(dividers).toHaveLength(2);
    dividers.forEach((divider) => {
      expect(divider).toHaveClass("flex-1", "bg-[var(--color-rule)]");
    });
  });
});
