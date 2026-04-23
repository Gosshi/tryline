// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "@/components/status-badge";

describe("StatusBadge", () => {
  it.each([
    ["scheduled", "キックオフ予定"],
    ["in_progress", "試合中"],
    ["finished", "終了"],
    ["postponed", "延期"],
    ["cancelled", "中止"],
  ] as const)("renders the expected Japanese label for %s", (status, label) => {
    render(<StatusBadge status={status} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
