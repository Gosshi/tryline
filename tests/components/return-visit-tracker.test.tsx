// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReturnVisitTracker } from "@/components/return-visit-tracker";

describe("ReturnVisitTracker", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("tracks return_visit when the previous visit was within seven days", async () => {
    localStorage.setItem(
      "tryline_last_visit_at",
      String(Date.now() - 4 * 24 * 60 * 60 * 1000),
    );
    const gtag = vi.fn();
    vi.stubGlobal("gtag", gtag);
    Object.defineProperty(window, "gtag", {
      configurable: true,
      value: gtag,
    });

    render(<ReturnVisitTracker />);

    await waitFor(() => {
      expect(gtag).toHaveBeenCalledWith("event", "return_visit", {
        days_since_last_visit: 4,
      });
    });
  });

  it("does not track return_visit for an immediate reload", async () => {
    const now = new Date("2026-07-10T12:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);
    localStorage.setItem(
      "tryline_last_visit_at",
      String(now - 5 * 60 * 1000),
    );
    const gtag = vi.fn();
    vi.stubGlobal("gtag", gtag);
    Object.defineProperty(window, "gtag", {
      configurable: true,
      value: gtag,
    });

    render(<ReturnVisitTracker />);

    await waitFor(() => {
      expect(localStorage.getItem("tryline_last_visit_at")).toBe(
        String(now),
      );
    });
    expect(gtag).not.toHaveBeenCalled();
  });

  it("tracks return_visit only once per session", async () => {
    const now = new Date("2026-07-10T12:00:00.000Z").getTime();
    vi.spyOn(Date, "now").mockReturnValue(now);
    localStorage.setItem(
      "tryline_last_visit_at",
      String(now - 2 * 24 * 60 * 60 * 1000),
    );
    const gtag = vi.fn();
    vi.stubGlobal("gtag", gtag);
    Object.defineProperty(window, "gtag", {
      configurable: true,
      value: gtag,
    });

    const { unmount } = render(<ReturnVisitTracker />);

    await waitFor(() => {
      expect(gtag).toHaveBeenCalledTimes(1);
    });

    unmount();
    localStorage.setItem(
      "tryline_last_visit_at",
      String(now - 2 * 24 * 60 * 60 * 1000),
    );
    render(<ReturnVisitTracker />);

    expect(gtag).toHaveBeenCalledTimes(1);
  });
});
