export type AnalyticsEventParams = Record<
  string,
  boolean | number | string | null | undefined
>;

export type CtaClickParams = {
  cta_id: string;
  cta_location: string;
  destination: string;
  content_type?: string;
  is_sample?: boolean;
  label?: string;
  language?: "en" | "ja";
  match_id?: string;
};

export function trackEvent(
  eventName: string,
  params: AnalyticsEventParams = {},
) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return;
  }

  window.gtag("event", eventName, params);
}

export function trackCtaClick(params: CtaClickParams) {
  trackEvent("cta_click", params);
}
