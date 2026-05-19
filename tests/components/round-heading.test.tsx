// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RoundHeading } from "@/components/round-heading";

describe("RoundHeading", () => {
  it("renders the round label with editorial display styles", () => {
    render(
      <RoundHeading groupKey={{ round: 1, roundName: null, type: "round" }} />,
    );

    expect(screen.getByText("第1節")).toHaveClass(
      "font-display",
      "text-xs",
      "tracking-[0.2em]",
      "text-[var(--color-ink-muted)]",
    );
  });

  it("renders dividers on both sides", () => {
    const { container } = render(
      <RoundHeading
        groupKey={{ round: null, roundName: null, type: "round" }}
      />,
    );

    expect(screen.getByText("節未定")).toBeInTheDocument();
    const dividers = container.querySelectorAll(".h-px");

    expect(dividers).toHaveLength(2);
    dividers.forEach((divider) => {
      expect(divider).toHaveClass("flex-1", "bg-[var(--color-rule)]");
    });
  });

  it("renders weekly group labels for roundless competitions", () => {
    render(
      <RoundHeading
        groupKey={{
          endDate: "2025-11-03",
          startDate: "2025-11-02",
          type: "week",
          weekIndex: 1,
        }}
      />,
    );

    expect(screen.getByText("第1節 - 11/2〜11/3")).toBeInTheDocument();
  });

  it("maps round zero to a playoff qualifier label", () => {
    render(
      <RoundHeading groupKey={{ round: 0, roundName: null, type: "round" }} />,
    );

    expect(screen.getByText("プレーオフ予選")).toBeInTheDocument();
    expect(screen.queryByText("Round 0")).not.toBeInTheDocument();
  });

  it("maps playoff round names to Japanese labels", () => {
    render(
      <RoundHeading
        groupKey={{ round: null, roundName: "quarterfinals", type: "round" }}
      />,
    );

    expect(screen.getByText("準々決勝")).toBeInTheDocument();
  });
});
