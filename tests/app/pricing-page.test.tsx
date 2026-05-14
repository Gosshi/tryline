// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PricingForm } from "@/app/pricing/pricing-form";

const authMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInWithOtp: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getUser: authMocks.getUser,
      signInWithOtp: authMocks.signInWithOtp,
    },
  }),
}));

describe("PricingForm", () => {
  beforeEach(() => {
    authMocks.getUser.mockReset();
    authMocks.signInWithOtp.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the auth modal instead of posting checkout when user is not signed in", async () => {
    authMocks.getUser.mockResolvedValue({ data: { user: null } });

    render(<PricingForm buttonLabel="Premium を始める — ¥980/月" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Premium を始める — ¥980/月" }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "ログイン" }),
      ).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText("メールアドレス")).toBeInTheDocument();

    const panel = screen.getByRole("heading", { name: "ログイン" }).parentElement;
    const wrapper = panel?.parentElement;
    const overlay = wrapper?.parentElement;

    expect(overlay).toHaveClass("fixed", "inset-0", "overflow-y-auto");
    expect(wrapper).toHaveClass(
      "min-h-full",
      "items-end",
      "sm:items-center",
    );
  });

  it("submits the checkout form when user is signed in", async () => {
    const submit = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => undefined);
    authMocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "fan@example.com" } },
    });

    render(<PricingForm buttonLabel="Premium を始める — ¥980/月" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Premium を始める — ¥980/月" }),
    );

    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.queryByRole("heading", { name: "ログイン" }),
    ).not.toBeInTheDocument();
  });
});
