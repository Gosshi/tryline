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
  getLatestCompletedMatch: vi.fn(),
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
  getLatestCompletedMatch: matchMocks.getLatestCompletedMatch,
  getRecentlyReviewedMatches: matchMocks.getRecentlyReviewedMatches,
}));

describe("PricingPage", () => {
  beforeEach(() => {
    matchMocks.getRecentlyReviewedMatches.mockReset();
    matchMocks.getLatestCompletedMatch.mockReset();
    matchMocks.getRecentlyReviewedMatches.mockResolvedValue([
      {
        awayTeam: { name: "France" },
        competition: { name: "Six Nations", season: "2027" },
        homeTeam: { name: "Ireland" },
        recapExcerpt:
          "前半の接点でIrelandが優位を作り、Franceの外側防御を何度も揺さぶったレビュー本文です。",
      },
    ]);
    matchMocks.getLatestCompletedMatch.mockResolvedValue({ id: "match-1" });
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

    expect(matchMocks.getRecentlyReviewedMatches).toHaveBeenCalledWith(5, "ja");
    expect(
      screen.getByRole("heading", {
        name: "週10試合以上のAI戦術分析を、日本語で読み放題。",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "7日間無料で試す" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "7日間無料 · その後 ¥980/月 · いつでもキャンセル可能 · Stripe 決済",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "無料で記事を読む" })).toHaveAttribute(
      "href",
      "/matches/match-1",
    );
    expect(screen.getByText("8大会対応")).toBeInTheDocument();
    expect(screen.getByText("500試合以上")).toBeInTheDocument();
    expect(screen.getByText("AI日本語解説")).toBeInTheDocument();

    for (const feature of [
      "試合スコア・順位表・得点推移グラフ",
      "大会アーカイブ閲覧",
      "AI 日本語プレビュー全文",
      "AI 日本語レビュー全文",
      "試合 AI チャット",
      "Web プッシュ通知",
    ]) {
      expect(screen.getAllByText(feature).length).toBeGreaterThan(0);
    }
    expect(
      screen.queryByText("AI 日本語レビュー（冒頭 300 文字）"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "試合スコア・順位表・ラインナップ・AI 日本語プレビュー全文・Web プッシュ通知は無料でご利用いただけます。AI 日本語レビュー全文・AI チャットは Premium 限定です。",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: "Premium のレビューはこんな内容です",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ireland vs France")).toBeInTheDocument();
    expect(screen.getByText(/前半の接点でIrelandが優位/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Premium で全文を読む" }),
    ).toBeInTheDocument();

    expect(screen.getByText("無料でどこまで利用できますか？")).toBeInTheDocument();
    expect(
      screen.getByText(
        "はい。初回登録時に 7 日間の無料トライアルをご利用いただけます。トライアル期間中は AI 日本語レビュー全文・AI チャットを含むすべての Premium 機能をお使いいただけます。トライアル終了後は自動的に ¥980/月の課金が始まります。期間中はいつでもキャンセル可能です。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("返金ポリシーを教えてください。")).toBeInTheDocument();
    expect(screen.getByText("いつでもキャンセルできますか？")).toBeInTheDocument();
    expect(
      screen.getByText("どの大会のコンテンツが読めますか？"),
    ).toBeInTheDocument();
    expect(screen.getByText("支払い方法は？")).toBeInTheDocument();
  });

  it("falls back to any published recap when Japanese sample content is empty", async () => {
    matchMocks.getRecentlyReviewedMatches
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          awayTeam: { name: "England" },
          competition: { name: "Rugby World Cup", season: "2027" },
          homeTeam: { name: "Japan" },
          recapExcerpt: "A published English recap excerpt is available.",
        },
      ]);

    render(await PricingPage());

    expect(matchMocks.getRecentlyReviewedMatches).toHaveBeenNthCalledWith(
      1,
      5,
      "ja",
    );
    expect(matchMocks.getRecentlyReviewedMatches).toHaveBeenNthCalledWith(2, 5);
    expect(screen.getByText("Japan vs England")).toBeInTheDocument();
    expect(
      screen.getByText("A published English recap excerpt is available."),
    ).toBeInTheDocument();
  });

  it("skips sample recaps that contain unsupported fabricated statistics", async () => {
    matchMocks.getRecentlyReviewedMatches.mockResolvedValueOnce([
      {
        awayTeam: { name: "France" },
        competition: { name: "Six Nations", season: "2027" },
        homeTeam: { name: "Ireland" },
        recapExcerpt: "Irelandはスクラム成功率85%でFranceを圧倒した。",
      },
      {
        awayTeam: { name: "Wales" },
        competition: { name: "Six Nations", season: "2027" },
        homeTeam: { name: "Scotland" },
        recapExcerpt:
          "Scotlandは後半のキック処理から陣地を押し返し、Walesの反撃を抑えた。",
      },
    ]);

    render(await PricingPage());

    expect(screen.queryByText(/スクラム成功率85%/)).not.toBeInTheDocument();
    expect(screen.getByText("Scotland vs Wales")).toBeInTheDocument();
    expect(screen.getByText(/後半のキック処理/)).toBeInTheDocument();
  });

  it("renders a meaningful fallback when no sample recap exists", async () => {
    matchMocks.getRecentlyReviewedMatches
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    render(await PricingPage());

    expect(screen.getByText("試合直後に更新")).toBeInTheDocument();
    expect(
      screen.getByText(/レビュー全文と AI チャットは Premium 限定です。/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("公開済みレビューを準備中です。"),
    ).not.toBeInTheDocument();
  });

  it("falls back to the homepage when there is no completed match yet", async () => {
    matchMocks.getLatestCompletedMatch.mockResolvedValueOnce(null);

    render(await PricingPage());

    expect(screen.getByRole("link", { name: "無料で記事を読む" })).toHaveAttribute(
      "href",
      "/",
    );
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