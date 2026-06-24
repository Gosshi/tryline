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

  it("links each competition family to its evergreen Japanese hub", () => {
    expect(HEADER_COMPETITIONS).toEqual([
      {
        family: "six-nations",
        href: "/c/six-nations",
        label: "シックスネイションズ",
      },
      {
        family: "premiership",
        href: "/c/premiership",
        label: "プレミアシップ",
      },
      {
        family: "urc",
        href: "/c/urc",
        label: "ユナイテッド・ラグビー・チャンピオンシップ",
      },
      {
        family: "top-14",
        href: "/c/top-14",
        label: "トップ14",
      },
      {
        family: "super-rugby-pacific",
        href: "/c/super-rugby-pacific",
        label: "スーパーラグビー・パシフィック",
      },
      {
        family: "rugby-championship",
        href: "/c/rugby-championship",
        label: "ザ・ラグビーチャンピオンシップ",
      },
      {
        family: "nations-championship",
        href: "/c/nations-championship",
        label: "ネーションズチャンピオンシップ",
      },
      {
        family: "rwc",
        href: "/c/rwc",
        label: "ラグビーワールドカップ",
      },
      {
        family: "league-one",
        href: "/c/league-one",
        label: "ジャパンラグビー リーグワン",
      },
      {
        family: "autumn-nations",
        href: "/c/autumn-nations",
        label: "オータムネーションズシリーズ",
      },
      {
        family: "pnc",
        href: "/c/pnc",
        label: "パシフィック・ネーションズカップ",
      },
    ]);
    expect(
      HEADER_COMPETITIONS.every(
        (competition) => competition.href === `/c/${competition.family}`,
      ),
    ).toBe(true);
    expect(
      HEADER_COMPETITIONS.some((competition) => /\d{4}/.test(competition.href)),
    ).toBe(false);
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
    fireEvent.click(screen.getByRole("link", { name: "シックスネイションズ" }));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
