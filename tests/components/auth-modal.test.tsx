// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthModal } from "@/components/auth-modal";

vi.mock("@/lib/auth/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signInWithOAuth: vi.fn(),
      signInWithOtp: vi.fn(),
    },
  }),
}));

describe("AuthModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the default login copy", async () => {
    render(<AuthModal onClose={() => undefined} />);

    expect(
      await screen.findByRole("heading", { name: "ログイン" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("ログイン後、自動的に決済ページに移動します。"),
    ).not.toBeInTheDocument();
  });

  it("renders subscribe intent copy", async () => {
    render(<AuthModal intent="subscribe" onClose={() => undefined} />);

    expect(
      await screen.findByRole("heading", { name: "Premium を始める" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("ログイン後、自動的に決済ページに移動します。"),
    ).toBeInTheDocument();
  });
});
