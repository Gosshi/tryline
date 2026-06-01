// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteFooter } from "@/components/site-footer";

describe("SiteFooter", () => {
  it("renders the X follow link", () => {
    render(<SiteFooter />);

    const link = screen.getByRole("link", { name: /@tryline_rugbyjp/ });

    expect(screen.getByText("フォロー")).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://x.com/tryline_rugbyjp");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});