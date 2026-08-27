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

export type NewsletterSource = "calendar" | "competition" | "home";

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

export function trackFavoriteTeamAdded(params: {
  team_slug: string;
  source: string;
}) {
  trackEvent("favorite_team_added", params);
}

export function trackPushPermissionGranted() {
  trackEvent("push_permission_granted");
}

export function trackReturnVisit(params: { days_since_last_visit: number }) {
  trackEvent("return_visit", params);
}

export function trackNewsletterView(params: { source: NewsletterSource }) {
  trackEvent("newsletter_view", params);
}

export function trackNewsletterSubmit(params: { source: NewsletterSource }) {
  trackEvent("newsletter_submit", params);
}

export function trackNewsletterResult(params: {
  source: NewsletterSource;
  status: "error" | "network_error" | "ok" | "rate_limited";
}) {
  trackEvent("newsletter_result", params);
}

export function trackNewsletterConfirmed() {
  trackEvent("newsletter_confirmed");
}
