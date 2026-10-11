// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PricingAuthResume } from "@/app/pricing/pricing-auth-resume";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  trackBeginCheckout: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(location.search),
}));
vi.mock("@/lib/auth/client", () => ({
  getSupabaseBrowserClient: () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@/lib/analytics", () => ({
  trackBeginCheckout: mocks.trackBeginCheckout,
}));

describe("PricingAuthResume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    history.replaceState({ retained: true }, "", "/pricing");
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("resumes checkout and analytics exactly once in Strict Mode", async () => {
    history.replaceState(
      { retained: true },
      "",
      "/pricing?resume=checkout&signup=success#plans",
    );
    let resolveUser!: (value: {
      data: { user: { id: string } };
      error: null;
    }) => void;
    mocks.getUser.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUser = resolve;
        }),
    );
    const submit = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(function (this: HTMLFormElement) {
        expect(this.action).toBe(`${location.origin}/api/stripe/checkout`);
        expect(this.method).toBe("post");
        expect(location.search).toBe("?signup=success");
        expect(mocks.trackBeginCheckout).toHaveBeenCalledOnce();
      });
    const view = render(
      <StrictMode>
        <PricingAuthResume />
      </StrictMode>,
    );
    expect(location.pathname + location.search + location.hash).toBe(
      "/pricing?signup=success#plans",
    );
    expect(history.state).toEqual({ retained: true });
    expect(mocks.getUser).toHaveBeenCalledOnce();
    await act(async () =>
      resolveUser({ data: { user: { id: "user-1" } }, error: null }),
    );
    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    expect(mocks.trackBeginCheckout).toHaveBeenCalledExactlyOnceWith({
      cta_id: "pricing_auth_resume",
      cta_location: "auth_resume",
      destination: "/api/stripe/checkout",
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "決済ページへ移動しています…",
    );
    view.unmount();
    render(<PricingAuthResume />);
    expect(submit).toHaveBeenCalledOnce();
    expect(mocks.trackBeginCheckout).toHaveBeenCalledOnce();
  });

  it.each([null, { name: "AuthSessionMissingError" }])(
    "removes resume without submitting for an anonymous user (error=%j)",
    async (error) => {
      mocks.getUser.mockResolvedValue({ data: { user: null }, error });
      history.replaceState(null, "", "/pricing?resume=checkout");
      const submit = vi
        .spyOn(HTMLFormElement.prototype, "submit")
        .mockImplementation(() => undefined);
      render(
        <StrictMode>
          <PricingAuthResume />
        </StrictMode>,
      );
      await act(async () => undefined);
      expect(location.search).toBe("");
      expect(mocks.getUser).toHaveBeenCalledOnce();
      expect(submit).not.toHaveBeenCalled();
      expect(mocks.trackBeginCheckout).not.toHaveBeenCalled();
      expect(screen.queryByRole("status")).toBeNull();
    },
  );

  it("shows existing Premium guidance and removes only its query", () => {
    history.replaceState(
      { retained: true },
      "",
      "/pricing?already_premium=1&from=hero#plans",
    );
    const submit = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => undefined);
    render(
      <StrictMode>
        <PricingAuthResume />
      </StrictMode>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "すでに Premium をご利用中です。",
    );
    expect(location.pathname + location.search + location.hash).toBe(
      "/pricing?from=hero#plans",
    );
    expect(history.state).toEqual({ retained: true });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(mocks.trackBeginCheckout).not.toHaveBeenCalled();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("does nothing without a checkout or Premium query", () => {
    const submit = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => undefined);
    const replace = vi.spyOn(history, "replaceState");
    const { container } = render(<PricingAuthResume />);
    expect(container.textContent).toBe("");
    expect(replace).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(mocks.trackBeginCheckout).not.toHaveBeenCalled();
  });
});
