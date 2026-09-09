export type BillingTerms = {
  legalMonthlyPriceLabel: string;
  monthlyPriceLabel: string;
  pricingDescription: string;
  pricingSummary: string;
  serviceProvisionTiming: string;
  paymentTiming: string;
  trialDays: number;
  trialFaqAnswer: string;
  trialHeroLabel: string | null;
  trialRecapCtaLabel: string;
  trialFullContentCtaLabel: string;
};

type BillingTermsInput = {
  monthlyPriceYen: number;
  trialDays: number;
};

function formatYen(amount: number) {
  return `¥${amount.toLocaleString("ja-JP")}/月`;
}

export function createBillingTerms({
  monthlyPriceYen,
  trialDays,
}: BillingTermsInput): BillingTerms {
  const monthlyPriceLabel = formatYen(monthlyPriceYen);

  if (trialDays > 0) {
    const trialHeroLabel = `${trialDays}日間無料`;

    return {
      legalMonthlyPriceLabel: `月額 ${formatYen(monthlyPriceYen).replace("/月", "")}`,
      monthlyPriceLabel,
      paymentTiming: `無料トライアル終了後に初回課金、以降は毎月の契約更新日に自動課金`,
      pricingDescription: `見逃した海外ラグビーを日本語レビューと試合Q&Aで深く追える Tryline Premium。${trialHeroLabel}、その後 ${monthlyPriceLabel}。`,
      pricingSummary: `${trialHeroLabel} · その後 ${monthlyPriceLabel} · いつでもキャンセル可能 · Stripe 決済`,
      serviceProvisionTiming: "無料トライアル開始時から直ちに利用可能",
      trialDays,
      trialFaqAnswer: `はい。初回登録時に ${trialDays} 日間の無料トライアルをご利用いただけます。トライアル期間中は日本語レビュー全文・試合Q&Aを含むすべての Premium 機能をお使いいただけます。トライアル終了後は自動的に ${monthlyPriceLabel}の課金が始まります。期間中はいつでもキャンセル可能です。`,
      trialFullContentCtaLabel: `${trialHeroLabel}で全文を読む`,
      trialHeroLabel,
      trialRecapCtaLabel: `${trialHeroLabel}でレビュー全文を読む`,
    };
  }

  return {
    legalMonthlyPriceLabel: `月額 ${formatYen(monthlyPriceYen).replace("/月", "")}`,
    monthlyPriceLabel,
    paymentTiming: "申し込み時に課金、以降は毎月の契約更新日に自動課金",
    pricingDescription: `見逃した海外ラグビーを日本語レビューと試合Q&Aで深く追える Tryline Premium。${monthlyPriceLabel}。`,
    pricingSummary: `${monthlyPriceLabel} · 申し込み時に課金 · いつでもキャンセル可能 · Stripe 決済`,
    serviceProvisionTiming: "申し込み完了後、直ちに利用可能",
    trialDays,
    trialFaqAnswer: `現在、無料トライアルはありません。申し込み時から ${monthlyPriceLabel} の課金が始まります。いつでもキャンセル可能です。`,
    trialFullContentCtaLabel: "Premium で全文を読む",
    trialHeroLabel: null,
    trialRecapCtaLabel: "Premium でレビュー全文を読む",
  };
}

export const BILLING_TERMS = createBillingTerms({
  monthlyPriceYen: 980,
  trialDays: 7,
});
