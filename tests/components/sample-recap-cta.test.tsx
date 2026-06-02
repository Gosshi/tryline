// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SampleRecapCta } from "@/components/sample-recap-cta";

describe("SampleRecapCta", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tracks pricing CTA clicks with GA", () => {
    const gtag = vi.fn();
    vi.stubGlobal("gtag", gtag);
    Object.defineProperty(window, "gtag", {
      configurable: true,
      value: gtag,
    });

    render(<SampleRecapCta matchId="match-sample" />);
    fireEvent.click(screen.getByRole("link", { name: "7日間無料で試す" }));

    expect(gtag).toHaveBeenCalledWith("event", "sample_recap_cta_click", {
      destination: "pricing",
      language: "ja",
      match_id: "match-sample",
    });
  });
});
