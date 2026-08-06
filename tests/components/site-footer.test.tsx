// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SiteFooter } from "@/components/site-footer";

describe("SiteFooter", () => {
  it("renders the X follow link", () => {
    render(<SiteFooter />);

    const link = screen.getByRole("link", {
      name: "X (Twitter) @tryline_rugbyjp",
    });
    const noteLink = screen.getByRole("link", {
      name: "note @tryline_rugbyjp",
    });

    expect(screen.getByText("フォロー")).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://x.com/tryline_rugbyjp");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(noteLink).toHaveAttribute(
      "href",
      "https://note.com/tryline_rugbyjp",
    );
    expect(noteLink).toHaveAttribute("target", "_blank");
    expect(noteLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("links to the support page from the service navigation", () => {
    render(<SiteFooter />);

    expect(
      screen
        .getAllByRole("link", { name: "サポート・お問い合わせ" })
        .every((link) => link.getAttribute("href") === "/support"),
    ).toBe(true);
  });
});
