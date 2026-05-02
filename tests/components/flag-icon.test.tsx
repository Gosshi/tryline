// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FlagIcon } from "@/components/flag-icon";

describe("FlagIcon", () => {
  it("renders the inline SVG flag for a known team", () => {
    const { container } = render(<FlagIcon slug="england" />);

    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container.querySelector("[aria-hidden='true']")).toHaveStyle({
      height: "20px",
      width: "30px",
    });
  });

  it("falls back to the rugby icon for an unknown team", () => {
    render(<FlagIcon slug="unknown" />);

    expect(screen.getByText("🏉")).toBeInTheDocument();
  });
});
