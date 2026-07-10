// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MatchContentTrustStrip } from "@/components/match-content-trust-strip";

import type { PublishedMatchContent } from "@/lib/db/queries/match-content";

const content: PublishedMatchContent = {
  contentMdJa: "本文",
  contentType: "recap",
  generatedAt: "2026-07-10T12:34:56.000Z",
  modelVersion: "gpt-4o",
  promptVersion: "recap@1.0.0",
};

describe("MatchContentTrustStrip", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows confirmed lineups, sourced fact count, and generated date", () => {
    render(
      <MatchContentTrustStrip
        content={content}
        hasConfirmedLineups
        sourcedFactCount={2}
      />,
    );

    expect(screen.getByText("ラインアップ確認済み")).toBeInTheDocument();
    expect(screen.getByText("参照元2件")).toBeInTheDocument();
    expect(screen.getByText("更新: 2026-07-10")).toBeInTheDocument();
  });

  it("does not show negative or zero-count trust labels", () => {
    render(
      <MatchContentTrustStrip
        content={content}
        hasConfirmedLineups={false}
        sourcedFactCount={0}
      />,
    );

    expect(screen.queryByText("ラインアップ確認済み")).toBeNull();
    expect(screen.queryByText("参照元0件")).toBeNull();
    expect(screen.queryByText(/未確認/)).toBeNull();
    expect(screen.getByText("更新: 2026-07-10")).toBeInTheDocument();
  });
});
