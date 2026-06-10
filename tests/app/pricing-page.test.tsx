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
import { PRIMARY_SAMPLE_MATCH_ID } from "@/lib/sample-matches";

const competitionFaqAnswer =
  "Six Nations、Premiership、URC、Top 14、Super Rugby Pacific、Rugby Championship、Autumn Nations Series、リーグワン、Pacific Nations Cup、RWC 2027 に対応しています。";

const authMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInWithOtp: vi.fn(),
}));

const matchMocks = vi.hoisted(() => ({
  getRecentlyReviewedMatchById: vi.fn(),
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
  getRecentlyReviewedMatchById: matchMocks.getRecentlyReviewedMatchById,
}));

describe("PricingPage", () => {
  beforeEach(() => {
    matchMocks.getRecentlyReviewedMatchById.mockReset();
    matchMocks.getRecentlyReviewedMatchById.mockResolvedValue({
      awayTeam: { name: "Gloucester" },
      competition: { name: "Premiership", season: "2025-26" },
      homeTeam: { name: "Northampton" },
      id: PRIMARY_SAMPLE_MATCH_ID,
      recapExcerpt:
        "Northamptonは終盤の接点でGloucesterの圧力を受け止め、接戦を制したレビュー本文です。",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("exports pricing metadata for the root title template", () => {
    expect(metadata).toMatchObject({
      description:
        "見逃した海外ラグビーの試合を日本語レビューと AI チャットで深く追える Tryline Premium。7日間無料、その後 ¥980/月。",
      title: "プランを選ぶ",
    });
  });

  it("renders the redesigned pricing landing page sections", async () => {
    render(await PricingPage());

    expect(matchMocks.getRecentlyReviewedMatchById).toHaveBeenCalledWith(
      PRIMARY_SAMPLE_MATCH_ID,
      "ja",
    );
    expect(
      screen.getByRole("heading", {
        name: "見逃した海外ラグビーを、日本語で深く追える。",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "7日間無料でレビュー全文を読む" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "7日間無料 · その後 ¥980/月 · いつでもキャンセル可能 · Stripe 決済",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "無料サンプルを読む" }),
    ).toHaveAttribute("href", `/matches/${PRIMARY_SAMPLE_MATCH_ID}`);
    expect(screen.getByText("10大会対応")).toBeInTheDocument();
    expect(screen.getByText("500試合以上")).toBeInTheDocument();
    expect(screen.getByText("7日間無料")).toBeInTheDocument();

    for (const feature of [
      "試合スコア・順位表・得点推移グラフ",
      "大会アーカイブ閲覧",
      "日本語プレビュー全文",
      "日本語レビュー全文",
      "試合 AI チャット",
      "試合更新・公開通知",
    ]) {
      expect(screen.getAllByText(feature).length).toBeGreaterThan(0);
    }
    expect(
      screen.queryByText("AI 日本語レビュー（冒頭 300 文字）"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "試合スコア・順位表・ラインナップ・日本語プレビュー全文・試合更新通知は無料でご利用いただけます。日本語レビュー全文・試合 AI チャットは Premium 限定です。",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: "まず無料サンプルで確認できます",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Northampton vs Gloucester")).toBeInTheDocument();
    expect(screen.getByText(/Northamptonは終盤の接点/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "7日間無料で全文を読む" }),
    ).toBeInTheDocument();

    expect(
      screen.getByText("無料でどこまで利用できますか？"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "はい。初回登録時に 7 日間の無料トライアルをご利用いただけます。トライアル期間中は日本語レビュー全文・試合 AI チャットを含むすべての Premium 機能をお使いいただけます。トライアル終了後は自動的に ¥980/月の課金が始まります。期間中はいつでもキャンセル可能です。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("返金ポリシーを教えてください。"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("いつでもキャンセルできますか？"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("どの大会のコンテンツが読めますか？"),
    ).toBeInTheDocument();
    expect(screen.getByText(competitionFaqAnswer)).toBeInTheDocument();
    expect(
      [...document.querySelectorAll('script[type="application/ld+json"]')].some(
        (script) => script.textContent?.includes(competitionFaqAnswer),
      ),
    ).toBe(true);
    expect(screen.getByText("支払い方法は？")).toBeInTheDocument();
  });

  it("renders a meaningful fallback when no sample recap exists", async () => {
    matchMocks.getRecentlyReviewedMatchById.mockResolvedValueOnce(null);

    render(await PricingPage());

    expect(
      screen.getByRole("link", { name: "無料サンプルを読む" }),
    ).toHaveAttribute("href", "/");
    expect(screen.getByText("試合直後に更新")).toBeInTheDocument();
    expect(
      screen.getByText(/レビュー全文と 試合 AI チャットは Premium 限定です。/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("公開済みレビューを準備中です。"),
    ).not.toBeInTheDocument();
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
