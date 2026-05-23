// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PremiumUpsellBanner } from "@/components/premium-upsell-banner";

describe("PremiumUpsellBanner", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("starts hidden and appears for non-premium users", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ isPremium: false }),
        }),
      ),
    );

    render(<PremiumUpsellBanner />);

    expect(
      screen.queryByText("AI 日本語レビューを全文読むには Premium が必要です"),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText("AI 日本語レビューを全文読むには Premium が必要です"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("link", { name: "Premium を始める — ¥980/月" }),
    ).toHaveAttribute("href", "/pricing");
  });

  it("stays hidden for premium users", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ isPremium: true }),
        }),
      ),
    );

    render(<PremiumUpsellBanner />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/me/premium");
    });
    expect(
      screen.queryByText("AI 日本語レビューを全文読むには Premium が必要です"),
    ).not.toBeInTheDocument();
  });
});
