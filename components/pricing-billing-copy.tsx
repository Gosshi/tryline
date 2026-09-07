import type { BillingTerms } from "@/lib/billing/terms";

export function PricingTrialBadge({
  billingTerms,
}: {
  billingTerms: BillingTerms;
}) {
  if (!billingTerms.trialHeroLabel) {
    return null;
  }

  return <span>{billingTerms.trialHeroLabel}</span>;
}

export function PricingBillingSummary({
  billingTerms,
}: {
  billingTerms: BillingTerms;
}) {
  return <>{billingTerms.pricingSummary}</>;
}
