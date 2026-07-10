// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CheckoutSuccessTracker } from "@/components/checkout-success-tracker";
import { SignupSuccessTracker } from "@/components/signup-success-tracker";

const navigationMocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => navigationMocks.searchParams,
}));

function stubGtag() {
  const gtag = vi.fn();
  vi.stubGlobal("gtag", gtag);
  Object.defineProperty(window, "gtag", {
    configurable: true,
    value: gtag,
  });

  return gtag;
}

describe("success trackers", () => {
  beforeEach(() => {
    navigationMocks.searchParams = new URLSearchParams();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("tracks only trial_start on checkout success", async () => {
    navigationMocks.searchParams = new URLSearchParams("checkout=success");
    const gtag = stubGtag();

    render(<CheckoutSuccessTracker />);

    await waitFor(() => {
      expect(gtag).toHaveBeenCalledWith("event", "trial_start");
    });
    expect(
      gtag.mock.calls.some(
        ([command, eventName]) =>
          command === "event" && eventName === "purchase",
      ),
    ).toBe(false);
  });

  it("tracks sign_up on signup success", async () => {
    navigationMocks.searchParams = new URLSearchParams("signup=success");
    const gtag = stubGtag();

    render(<SignupSuccessTracker />);

    await waitFor(() => {
      expect(gtag).toHaveBeenCalledWith("event", "sign_up");
    });
  });
});
