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

// `entry_surface` replaced GA4's reserved `source` parameter on 2026-09-11.
// Keep pre-change and post-change event data separate when analyzing it.
type EntrySurfaceParams = {
  entry_surface: string;
};

const GTAG_POLL_INTERVAL_MS = 250;
const GTAG_MAX_WAIT_MS = 10_000;
const MAX_QUEUED_EVENTS = 50;

type QueuedEvent = {
  eventName: string;
  params: AnalyticsEventParams;
};

let queue: QueuedEvent[] = [];
let pollTimer: ReturnType<typeof setInterval> | null = null;
let waitedMs = 0;

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  waitedMs = 0;
}

function flushQueue() {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return;
  }

  for (const { eventName, params } of queue) {
    window.gtag("event", eventName, params);
  }

  queue = [];
  stopPolling();
}

function startPolling() {
  if (pollTimer !== null) {
    return;
  }

  pollTimer = setInterval(() => {
    if (typeof window.gtag === "function") {
      flushQueue();
      return;
    }

    waitedMs += GTAG_POLL_INTERVAL_MS;
    if (waitedMs >= GTAG_MAX_WAIT_MS) {
      queue = [];
      stopPolling();
    }
  }, GTAG_POLL_INTERVAL_MS);
}

export function resetAnalyticsQueueForTests() {
  queue = [];
  stopPolling();
}

export function trackEvent(
  eventName: string,
  params: AnalyticsEventParams = {},
) {
  if (typeof window === "undefined") {
    return;
  }

  if (typeof window.gtag === "function") {
    flushQueue();
    window.gtag("event", eventName, params);
    return;
  }

  if (queue.length < MAX_QUEUED_EVENTS) {
    queue.push({ eventName, params });
  }

  startPolling();
}

export function trackCtaClick(params: CtaClickParams) {
  trackEvent("cta_click", params);
}

export function trackFavoriteTeamAdded(
  params: EntrySurfaceParams & { team_slug: string },
) {
  trackEvent("favorite_team_added", params);
}

export function trackPushPermissionGranted() {
  trackEvent("push_permission_granted");
}

export function trackReturnVisit(params: { days_since_last_visit: number }) {
  trackEvent("return_visit", params);
}

export function trackTrialStart() {
  trackEvent("trial_start");
}

export function trackSignUp() {
  trackEvent("sign_up");
}

export function trackPaywallView(params: {
  content_type: string;
  is_sample?: boolean;
  match_id?: string;
  paywall_location?: string;
  viewer_type?: "anonymous" | "free";
}) {
  trackEvent("paywall_view", params);
}

export function trackNewsletterView(
  params: EntrySurfaceParams & { entry_surface: NewsletterSource },
) {
  trackEvent("newsletter_view", params);
}

export function trackNewsletterSubmit(
  params: EntrySurfaceParams & { entry_surface: NewsletterSource },
) {
  trackEvent("newsletter_submit", params);
}

export function trackNewsletterResult(params: {
  entry_surface: NewsletterSource;
  status: "error" | "network_error" | "ok" | "rate_limited";
}) {
  trackEvent("newsletter_result", params);
}

export function trackNewsletterConfirmed() {
  trackEvent("newsletter_confirmed");
}
