// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CheckoutSuccessTracker } from "@/components/checkout-success-tracker";
import { PaywallViewTracker } from "@/components/paywall-view-tracker";
import { SignupSuccessTracker } from "@/components/signup-success-tracker";

const navigationMocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => navigationMocks.searchParams,
}));

function setGtag(gtag: ReturnType<typeof vi.fn> | undefined) {
  Object.defineProperty(window, "gtag", {
    configurable: true,
    value: gtag,
    writable: true,
  });
}

function defineGtagAndFlush() {
  const gtag = vi.fn();
  setGtag(gtag);
  act(() => {
    vi.advanceTimersByTime(250);
  });
  return gtag;
}

describe("gtag load race trackers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    navigationMocks.searchParams = new URLSearchParams();
    setGtag(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    setGtag(vi.fn());
    act(() => {
      vi.advanceTimersByTime(250);
    });
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("queues trial_start and sign_up when gtag is unavailable at mount", () => {
    navigationMocks.searchParams = new URLSearchParams(
      "checkout=success&signup=success",
    );

    render(
      <>
        <CheckoutSuccessTracker />
        <SignupSuccessTracker />
      </>,
    );

    const gtag = defineGtagAndFlush();

    expect(gtag.mock.calls).toEqual([
      ["event", "trial_start", {}],
      ["event", "sign_up", {}],
    ]);
  });

  it("keeps checkout and signup success conditions unchanged", () => {
    render(
      <>
        <CheckoutSuccessTracker />
        <SignupSuccessTracker />
      </>,
    );

    const gtag = defineGtagAndFlush();

    expect(gtag).not.toHaveBeenCalled();
  });

  it("queues paywall_view with the existing parameters until gtag loads", () => {
    render(<PaywallViewTracker contentType="recap" matchId="match-1" />);

    const gtag = defineGtagAndFlush();

    expect(gtag).toHaveBeenCalledWith("event", "paywall_view", {
      content_type: "recap",
      match_id: "match-1",
    });
  });
});
