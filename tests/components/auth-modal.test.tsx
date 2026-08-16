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
    authMocks.signInWithOtp.mockReset();
    authMocks.signInWithOAuth.mockResolvedValue({ error: null });
    authMocks.signInWithOtp.mockResolvedValue({ error: null });
  });

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

  it("normalizes whitespace before sending an email address", async () => {
    render(<AuthModal onClose={() => undefined} />);

    const emailInput = await screen.findByPlaceholderText("メールアドレス");
    fireEvent.change(emailInput, {
      target: { value: "　 user+tag@example.co.jp\n\t" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Magic Link を送る" }));

    await waitFor(() => {
      expect(authMocks.signInWithOtp).toHaveBeenCalledWith(
        expect.objectContaining({ email: "user+tag@example.co.jp" }),
      );
    });
    expect(emailInput).toHaveValue("user+tag@example.co.jp");
  });

  it("does not call Supabase for an empty email address", async () => {
    render(<AuthModal onClose={() => undefined} />);

    fireEvent.click(
      await screen.findByRole("button", { name: "Magic Link を送る" }),
    );

    expect(authMocks.signInWithOtp).not.toHaveBeenCalled();
    expect(
      screen.getByText("メールアドレスを入力してください。"),
    ).toBeInTheDocument();
  });

  it("does not call Supabase for an email address without @", async () => {
    render(<AuthModal onClose={() => undefined} />);

    fireEvent.change(await screen.findByPlaceholderText("メールアドレス"), {
      target: { value: "userexample" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Magic Link を送る" }));

    expect(authMocks.signInWithOtp).not.toHaveBeenCalled();
    expect(
      screen.getByText("メールアドレスの形式が正しくありません。"),
    ).toBeInTheDocument();
  });

  it("shows a specific message for Supabase invalid format errors", async () => {
    authMocks.signInWithOtp.mockResolvedValue({
      error: {
        message: "Unable to validate email address: invalid format",
        status: 400,
      },
    });
    render(<AuthModal onClose={() => undefined} />);

    fireEvent.change(await screen.findByPlaceholderText("メールアドレス"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Magic Link を送る" }));

    expect(
      await screen.findByText("メールアドレスの形式が正しくありません。"),
    ).toBeInTheDocument();
  });

  it("shows a retry message for rate limits without exposing account details", async () => {
    authMocks.signInWithOtp.mockResolvedValue({
      error: { message: "rate limit exceeded", status: 429 },
    });
    render(<AuthModal onClose={() => undefined} />);

    fireEvent.change(await screen.findByPlaceholderText("メールアドレス"), {
      target: { value: "first.last@sub.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Magic Link を送る" }));

    expect(
      await screen.findByText("時間をおいてお試しください。"),
    ).toBeInTheDocument();
  });

  it("shows a mapped error when Google login fails", async () => {
    authMocks.signInWithOAuth.mockResolvedValue({
      error: { message: "rate limit exceeded", status: 429 },
    });
    render(<AuthModal onClose={() => undefined} />);

    fireEvent.click(await screen.findByRole("button", { name: "Google でログイン" }));

    expect(
      await screen.findByText("時間をおいてお試しください。"),
    ).toBeInTheDocument();
  });

  it("prevents duplicate submissions while a request is pending", async () => {
    let finishRequest!: (result: { error: { message: string } }) => void;
    authMocks.signInWithOtp.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRequest = resolve;
        }),
    );
    render(<AuthModal onClose={() => undefined} />);

    fireEvent.change(await screen.findByPlaceholderText("メールアドレス"), {
      target: { value: "user@example.com" },
    });
    const submitButton = screen.getByRole("button", {
      name: "Magic Link を送る",
    });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(submitButton).toBeDisabled();
    expect(authMocks.signInWithOtp).toHaveBeenCalledTimes(1);

    finishRequest({ error: { message: "Unexpected error" } });
    await waitFor(() => expect(submitButton).not.toBeDisabled());
  });
});
