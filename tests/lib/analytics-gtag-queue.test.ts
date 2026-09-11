// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  trackCtaClick,
  trackEvent,
  trackFavoriteTeamAdded,
  trackNewsletterConfirmed,
  trackNewsletterResult,
  trackNewsletterSubmit,
  trackNewsletterView,
  trackPaywallView,
  trackPushPermissionGranted,
  trackReturnVisit,
  trackSignUp,
  trackTrialStart,
} from "@/lib/analytics";

function setGtag(gtag: ReturnType<typeof vi.fn> | undefined) {
  Object.defineProperty(window, "gtag", {
    configurable: true,
    value: gtag,
    writable: true,
  });
}

function defineGtagAndFlush() {
  const gtag = vi.fn();
  setGtag(gtag);
  vi.advanceTimersByTime(250);
  return gtag;
}

describe("analytics gtag queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setGtag(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("queues an event until gtag becomes available", () => {
    trackEvent("a");

    const gtag = defineGtagAndFlush();

    expect(gtag).toHaveBeenCalledWith("event", "a", {});
  });

  it("flushes queued events in FIFO order", () => {
    trackEvent("a");
    trackEvent("b");
    trackEvent("c");

    const gtag = defineGtagAndFlush();

    expect(gtag.mock.calls.map(([, eventName]) => eventName)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("sends synchronously when gtag is already available", () => {
    const gtag = vi.fn();
    setGtag(gtag);

    trackEvent("immediate", { entry_surface: "test" });

    expect(gtag).toHaveBeenCalledWith("event", "immediate", {
      entry_surface: "test",
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops polling and discards events after ten seconds", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    trackEvent("discarded");

    vi.advanceTimersByTime(10_000);

    expect(vi.getTimerCount()).toBe(0);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    const gtag = defineGtagAndFlush();
    expect(gtag).not.toHaveBeenCalled();
  });

  it("keeps the first fifty queued events when the queue is full", () => {
    for (let index = 0; index <= 50; index += 1) {
      trackEvent(`event-${index}`);
    }

    const gtag = defineGtagAndFlush();
    const eventNames = gtag.mock.calls.map(([, eventName]) => eventName);

    expect(eventNames).toHaveLength(50);
    expect(eventNames[0]).toBe("event-0");
    expect(eventNames.at(-1)).toBe("event-49");
    expect(eventNames).not.toContain("event-50");
  });

  it("starts only one polling timer for multiple queued events", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    trackEvent("a");
    trackEvent("b");
    trackEvent("c");

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    defineGtagAndFlush();
  });

  it("does not queue events during SSR", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    vi.stubGlobal("window", undefined);

    trackEvent("server-rendered");

    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it("does not pass GA4 reserved attribution keys from any analytics event", () => {
    const gtag = vi.fn();
    setGtag(gtag);

    trackEvent("custom_event", { custom_value: "value" });
    trackCtaClick({
      content_type: "preview",
      cta_id: "subscribe",
      cta_location: "header",
      destination: "/newsletter",
      is_sample: true,
      label: "登録",
      language: "ja",
      match_id: "match-1",
    });
    trackFavoriteTeamAdded({
      entry_surface: "team_picker",
      team_slug: "all-blacks",
    });
    trackPushPermissionGranted();
    trackReturnVisit({ days_since_last_visit: 7 });
    trackTrialStart();
    trackSignUp();
    trackPaywallView({
      content_type: "preview",
      is_sample: true,
      match_id: "match-1",
      paywall_location: "article",
      viewer_type: "anonymous",
    });
    trackNewsletterView({ entry_surface: "home" });
    trackNewsletterSubmit({ entry_surface: "competition" });
    trackNewsletterResult({ entry_surface: "calendar", status: "ok" });
    trackNewsletterConfirmed();

    const reservedKeys = ["source", "medium", "campaign", "term", "content"];
    for (const [, , params] of gtag.mock.calls) {
      expect(Object.keys(params)).not.toEqual(
        expect.arrayContaining(reservedKeys),
      );
    }
  });
});
