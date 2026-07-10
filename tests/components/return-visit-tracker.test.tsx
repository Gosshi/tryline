// @vitest-environment jsdom

import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ReturnVisitTracker } from "@/components/return-visit-tracker";

describe("ReturnVisitTracker", () => {
  afterEach(() => {
    localStorage.clear();
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
});
