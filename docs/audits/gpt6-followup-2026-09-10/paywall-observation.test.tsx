// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()),
  trackPaywallView: mocks.track,
}));
import { PaywallViewTracker } from "@/components/paywall-view-tracker";

afterEach(() => {
  cleanup();
  mocks.track.mockClear();
});

// Observations of current behavior; no browser layout claim is made by jsdom.
it("sends an exposure even in an explicitly hidden offscreen wrapper", () => {
  render(
    <div hidden style={{ marginTop: 10000 }}>
      <PaywallViewTracker contentType="recap" matchId="synthetic" />
    </div>,
  );
  expect(mocks.track).toHaveBeenCalledTimes(1);
});

it("sends twice during StrictMode effect replay", () => {
  render(
    <StrictMode>
      <PaywallViewTracker contentType="recap" matchId="synthetic" />
    </StrictMode>,
  );
  expect(mocks.track).toHaveBeenCalledTimes(2);
});
