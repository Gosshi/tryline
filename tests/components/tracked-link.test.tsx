// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TrackedLink } from "@/components/tracked-link";

describe("TrackedLink", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tracks CTA clicks with GA", () => {
    const gtag = vi.fn();
    vi.stubGlobal("gtag", gtag);
    Object.defineProperty(window, "gtag", {
      configurable: true,
      value: gtag,
    });

    render(
      <TrackedLink
        analytics={{
          cta_id: "test_cta",
          cta_location: "test_section",
          destination: "pricing",
          label: "料金",
        }}
        href="/pricing"
      >
        料金
      </TrackedLink>,
    );

    fireEvent.click(screen.getByRole("link", { name: "料金" }));

    expect(gtag).toHaveBeenCalledWith("event", "cta_click", {
      cta_id: "test_cta",
      cta_location: "test_section",
      destination: "pricing",
      label: "料金",
    });
  });
});
