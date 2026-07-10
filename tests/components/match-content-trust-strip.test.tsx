// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MatchContentTrustStrip } from "@/components/match-content-trust-strip";

describe("MatchContentTrustStrip", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows confirmed lineups and sourced fact count", () => {
    render(
      <MatchContentTrustStrip
        hasConfirmedLineups
        sourcedFactCount={2}
      />,
    );

    expect(screen.getByText("ラインアップ確認済み")).toBeInTheDocument();
    expect(screen.getByText("参照元2件")).toBeInTheDocument();
  });

  it("does not show negative or zero-count trust labels", () => {
    const { container } = render(
      <MatchContentTrustStrip
        hasConfirmedLineups={false}
        sourcedFactCount={0}
      />,
    );

    expect(screen.queryByText("ラインアップ確認済み")).toBeNull();
    expect(screen.queryByText("参照元0件")).toBeNull();
    expect(screen.queryByText(/未確認/)).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});
