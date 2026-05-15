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

import { AuthModal } from "@/components/auth-modal";

const authMocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signInWithOAuth: authMocks.signInWithOAuth,
      signInWithOtp: authMocks.signInWithOtp,
    },
  }),
}));

describe("AuthModal", () => {
  beforeEach(() => {
    authMocks.signInWithOAuth.mockReset();
    authMocks.signInWithOAuth.mockResolvedValue({ error: null });
    authMocks.signInWithOtp.mockReset();
    authMocks.signInWithOtp.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Google login above the existing Magic Link form", () => {
    render(<AuthModal onClose={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Google でログイン" }),
    ).toBeInTheDocument();
    expect(screen.getByText("または")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("メールアドレス")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Magic Link を送る" }),
    ).toBeInTheDocument();
  });

  it("starts Google OAuth with the auth callback redirect", async () => {
    render(<AuthModal onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Google でログイン" }));

    await waitFor(() => {
      expect(authMocks.signInWithOAuth).toHaveBeenCalledWith({
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
        provider: "google",
      });
    });
  });

  it("keeps the existing Magic Link flow working", async () => {
    render(<AuthModal onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("メールアドレス"), {
      target: { value: "fan@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Magic Link を送る" }));

    await waitFor(() => {
      expect(authMocks.signInWithOtp).toHaveBeenCalledWith({
        email: "fan@example.com",
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
    });
    expect(
      screen.getByText("メールを送りました。リンクをクリックしてログインしてください。"),
    ).toBeInTheDocument();
  });
});
