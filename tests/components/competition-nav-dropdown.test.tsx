// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  CompetitionNavDropdown,
  HEADER_COMPETITIONS,
} from "@/components/competition-nav-dropdown";
import { getCompetitionFamilyColor } from "@/lib/format/competition";

describe("CompetitionNavDropdown", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens the competition links with accessible listbox semantics", () => {
    render(<CompetitionNavDropdown />);

    const button = screen.getByRole("button", { name: "大会" });

    expect(button).toHaveAttribute("aria-haspopup", "listbox");
    expect(button).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    for (const competition of HEADER_COMPETITIONS) {
      const link = screen.getByRole("link", { name: competition.label });

      expect(link).toHaveAttribute("href", competition.href);
      expect(link).toHaveStyle({
        borderLeftColor: getCompetitionFamilyColor(competition.family),
      });
    }
  });

  it("toggles with Enter and closes with Escape", () => {
    render(<CompetitionNavDropdown />);

    const button = screen.getByRole("button", { name: "大会" });

    fireEvent.keyDown(button, { key: "Enter" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("toggles with Space and closes on outside pointer down", () => {
    render(
      <>
        <CompetitionNavDropdown />
        <button type="button">外側</button>
      </>,
    );

    const button = screen.getByRole("button", { name: "大会" });

    fireEvent.keyDown(button, { key: " " });
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "外側" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes after selecting a competition link", () => {
    render(<CompetitionNavDropdown />);

    fireEvent.click(screen.getByRole("button", { name: "大会" }));
    fireEvent.click(screen.getByRole("link", { name: "Six Nations 2025" }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
