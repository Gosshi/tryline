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
import { PricingBillingSummary } from "@/components/pricing-billing-copy";
import { PricingFaq } from "@/components/pricing-faq";
import { TokushoDisclosure } from "@/components/tokusho-disclosure";
import { BILLING_TERMS, createBillingTerms } from "@/lib/billing/terms";
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

const sampleMatchMocks = vi.hoisted(() => ({
  getPrimarySampleMatchId: vi.fn(),
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

vi.mock("@/lib/sample-matches", async (importOriginal) => ({
  ...((await importOriginal()) as object),
  getPrimarySampleMatchId: sampleMatchMocks.getPrimarySampleMatchId,
}));

describe("PricingPage", () => {
  beforeEach(() => {
    matchMocks.getRecentlyReviewedMatchById.mockReset();
    sampleMatchMocks.getPrimarySampleMatchId.mockResolvedValue(
      PRIMARY_SAMPLE_MATCH_ID,
    );
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
        "見逃した海外ラグビーの試合を日本語レビューと試合について質問できる機能で深く追える Tryline Premium。7日間無料、その後 ¥980/月。",
      title: "プランを選ぶ",
    });
  });

  it("uses the same product name in both billing-term branches", () => {
    const withTrial = createBillingTerms({ monthlyPriceYen: 980, trialDays: 7 });
    const withoutTrial = createBillingTerms({ monthlyPriceYen: 980, trialDays: 0 });

    expect(withTrial.pricingDescription).toContain("試合について質問できる機能");
    expect(withoutTrial.pricingDescription).toContain("試合について質問できる機能");
    expect(withTrial.pricingDescription).not.toContain("AI チャット");
    expect(withoutTrial.pricingDescription).not.toContain("AI チャット");
    expect(withTrial.pricingDescription).not.toContain("質問できる「この試合について質問する」");
    expect(withoutTrial.pricingDescription).not.toContain("質問できる「この試合について質問する」");
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
      "この試合について質問する",
      "試合更新・公開通知",
    ]) {
      expect(screen.getAllByText(feature).length).toBeGreaterThan(0);
    }
    expect(
      screen.queryByText("AI 日本語レビュー（冒頭 300 文字）"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "まず無料サンプルで確認できます",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Northampton 対 Gloucester")).toBeInTheDocument();
    expect(screen.getByText(/Northamptonは終盤の接点/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "7日間無料で全文を読む" }),
    ).toBeInTheDocument();

    expect(
      screen.getByText("無料でどこまで利用できますか？"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "はい。初回登録時に 7 日間の無料トライアルをご利用いただけます。トライアル期間中は日本語レビュー全文・試合について質問できる機能を含むすべての Premium 機能をお使いいただけます。トライアル終了後は自動的に ¥980/月の課金が始まります。期間中はいつでもキャンセル可能です。",
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /無料でどこまで利用できますか？/ }),
    );
    expect(
      screen.getByText(
        "試合スコア・順位表・ラインナップ・日本語プレビュー全文・試合更新通知は無料でご利用いただけます。日本語レビュー全文・「この試合について質問する」は Premium 限定です。",
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
    fireEvent.click(
      screen.getByRole("button", {
        name: /どの大会のコンテンツが読めますか？/,
      }),
    );
    expect(screen.getByText(competitionFaqAnswer)).toBeInTheDocument();
    expect(
      [...document.querySelectorAll('script[type="application/ld+json"]')].some(
        (script) => script.textContent?.includes(competitionFaqAnswer),
      ),
    ).toBe(true);
    expect(
      [...document.querySelectorAll('script[type="application/ld+json"]')].some(
        (script) => script.textContent?.includes(BILLING_TERMS.trialFaqAnswer),
      ),
    ).toBe(true);
    expect(metadata.description).not.toContain("AI チャット");
    const jsonLdPayloads = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((script) => JSON.parse(script.textContent ?? "{}"));
    const faqJsonLd = jsonLdPayloads.find((payload) => payload["@type"] === "FAQPage");
    const videoJsonLd = jsonLdPayloads.find((payload) => payload["@type"] === "VideoObject");
    expect(JSON.stringify(faqJsonLd)).not.toContain("AI チャット");
    expect(videoJsonLd?.description).toBe(
      "海外ラグビーの試合を日本語で解説。プレビュー・レビュー・試合について質問できる機能を紹介する Tryline の動画です。",
    );
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
      screen.getByText(/「この試合について質問する」は Premium 限定です。/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("公開済みレビューを準備中です。"),
    ).not.toBeInTheDocument();
  });

  it.each([
    {
      billingTerms: createBillingTerms({ monthlyPriceYen: 980, trialDays: 7 }),
      paymentTiming:
        "無料トライアル終了後に初回課金、以降は毎月の契約更新日に自動課金",
      pricingSummary:
        "7日間無料 · その後 ¥980/月 · いつでもキャンセル可能 · Stripe 決済",
      trialFaqAnswer:
        "はい。初回登録時に 7 日間の無料トライアルをご利用いただけます。トライアル期間中は日本語レビュー全文・試合について質問できる機能を含むすべての Premium 機能をお使いいただけます。トライアル終了後は自動的に ¥980/月の課金が始まります。期間中はいつでもキャンセル可能です。",
    },
    {
      billingTerms: createBillingTerms({ monthlyPriceYen: 980, trialDays: 0 }),
      paymentTiming: "申し込み時に課金、以降は毎月の契約更新日に自動課金",
      pricingSummary:
        "¥980/月 · 申し込み時に課金 · いつでもキャンセル可能 · Stripe 決済",
      trialFaqAnswer:
        "現在、無料トライアルはありません。申し込み時から ¥980/月 の課金が始まります。いつでもキャンセル可能です。",
    },
  ])(
    "keeps pricing and tokusho payment timing aligned when billing terms change",
    async ({ billingTerms, paymentTiming, pricingSummary, trialFaqAnswer }) => {
      const { unmount: unmountTokusho } = render(
        <TokushoDisclosure billingTerms={billingTerms} />,
      );
      expect(screen.getByText(paymentTiming)).toBeInTheDocument();
      expect(
        screen.getByText(billingTerms.serviceProvisionTiming),
      ).toBeInTheDocument();
      unmountTokusho();

      const { unmount: unmountPricingSummary } = render(
        <PricingBillingSummary billingTerms={billingTerms} />,
      );
      expect(screen.getByText(pricingSummary)).toBeInTheDocument();
      unmountPricingSummary();

      render(
        <PricingFaq
          faqs={[
            {
              answer: billingTerms.trialFaqAnswer,
              question: "無料トライアルはありますか？",
            },
          ]}
        />,
      );
      expect(screen.getByText(trialFaqAnswer)).toBeInTheDocument();
    },
  );
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
