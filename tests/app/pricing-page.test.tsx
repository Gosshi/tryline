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

import PricingPage, { metadata } from "@/app/pricing/page";
import { PricingForm } from "@/app/pricing/pricing-form";

const authMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInWithOtp: vi.fn(),
}));

const matchMocks = vi.hoisted(() => ({
  getRecentlyReviewedMatches: vi.fn(),
}));

vi.mock("@/lib/auth/client", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getUser: authMocks.getUser,
      signInWithOtp: authMocks.signInWithOtp,
    },
  }),
}));

vi.mock("@/lib/db/queries/matches", () => ({
  getRecentlyReviewedMatches: matchMocks.getRecentlyReviewedMatches,
}));

describe("PricingPage", () => {
  beforeEach(() => {
    matchMocks.getRecentlyReviewedMatches.mockReset();
    matchMocks.getRecentlyReviewedMatches.mockResolvedValue([
      {
        awayTeam: { name: "France" },
        competition: { name: "Six Nations", season: "2027" },
        homeTeam: { name: "Ireland" },
        recapExcerpt:
          "前半の接点でIrelandが優位を作り、Franceの外側防御を何度も揺さぶったレビュー本文です。",
      },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it("exports pricing metadata for the root title template", () => {
    expect(metadata).toMatchObject({
      description:
        "¥980/月で海外ラグビーの AI 日本語レビュー全文・AI チャットが読み放題。",
      title: "プランを選ぶ",
    });
  });

  it("renders the redesigned pricing landing page sections", async () => {
    render(await PricingPage());

    expect(matchMocks.getRecentlyReviewedMatches).toHaveBeenCalledWith(1);
    expect(
      screen.getByRole("heading", { name: "海外ラグビーを、もっと深く。" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Premium を始める — ¥980/月" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "無料で試す" })).toHaveAttribute(
      "href",
      "/",
    );

    for (const feature of [
      "試合スコア・順位表",
      "大会アーカイブ閲覧",
      "AI 日本語レビュー（冒頭 300 文字）",
      "AI 日本語レビュー全文",
      "AI 日本語プレビュー全文",
      "試合 AI チャット",
      "Web プッシュ通知",
    ]) {
      expect(screen.getByText(feature)).toBeInTheDocument();
    }

    expect(
      screen.getByRole("heading", {
        name: "Premium のレビューはこんな内容です",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ireland vs France")).toBeInTheDocument();
    expect(screen.getByText(/前半の接点でIrelandが優位/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "続きを読む → Premium を始める" }),
    ).toBeInTheDocument();

    expect(screen.getByText("いつでもキャンセルできますか？")).toBeInTheDocument();
    expect(
      screen.getByText("どの大会のコンテンツが読めますか？"),
    ).toBeInTheDocument();
    expect(screen.getByText("支払い方法は？")).toBeInTheDocument();
  });
});

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
        screen.getByRole("heading", { name: "Premium を始める" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText("ログイン後、自動的に決済ページに移動します。"),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("メールアドレス")).toBeInTheDocument();

    const panel = screen.getByRole("heading", {
      name: "Premium を始める",
    }).parentElement;
    const wrapper = panel?.parentElement;
    const overlay = wrapper?.parentElement;

    expect(overlay).toHaveClass("fixed", "inset-0", "overflow-y-auto");
    expect(wrapper).toHaveClass(
      "min-h-[100dvh]",
      "items-end",
      "sm:min-h-full",
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
      screen.queryByRole("heading", { name: "Premium を始める" }),
    ).not.toBeInTheDocument();
  });
});
