// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RoundHeading } from "@/components/round-heading";

describe("RoundHeading", () => {
  it("renders the round label with stronger heading styles", () => {
    render(<RoundHeading round={1} />);

    expect(screen.getByText("Round 1")).toHaveClass(
      "text-sm",
      "font-bold",
      "text-slate-600",
    );
  });

  it("keeps the divider styling", () => {
    const { container } = render(<RoundHeading round={null} />);

    expect(screen.getByText("節未定")).toBeInTheDocument();
    expect(container.querySelector(".h-px.flex-1.bg-slate-200")).not.toBeNull();
  });
});
