// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Paywall } from "@/components/paywall";

function stubGtag() {
  const gtag = vi.fn();
  vi.stubGlobal("gtag", gtag);
  Object.defineProperty(window, "gtag", {
    configurable: true,
    value: gtag,
  });

  return gtag;
}

describe("Paywall", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("tracks a paywall view when locked", async () => {
    const gtag = stubGtag();

    render(
      <Paywall contentType="recap" isPremium={false} matchId="match-1">
        <p>Locked content</p>
      </Paywall>,
    );

    await waitFor(() => {
      expect(gtag).toHaveBeenCalledWith("event", "paywall_view", {
        content_type: "recap",
        match_id: "match-1",
      });
    });
  });

  it("does not track a paywall view for premium users", async () => {
    const gtag = stubGtag();

    render(
      <Paywall contentType="recap" isPremium matchId="match-1">
        <p>Premium content</p>
      </Paywall>,
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(gtag).not.toHaveBeenCalled();
  });
});
