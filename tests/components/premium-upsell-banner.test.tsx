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
      screen.queryByText("試合後の日本語レビュー全文は Premium で読めます"),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.getByText("試合後の日本語レビュー全文は Premium で読めます"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByRole("link", { name: "7日間無料でレビュー全文を読む" }),
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
      screen.queryByText("試合後の日本語レビュー全文は Premium で読めます"),
    ).not.toBeInTheDocument();
  });
});
