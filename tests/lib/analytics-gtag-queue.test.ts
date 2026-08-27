// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { trackEvent } from "@/lib/analytics";

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
    setGtag(vi.fn());
    vi.advanceTimersByTime(250);
    vi.clearAllTimers();
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

    trackEvent("immediate", { source: "test" });

    expect(gtag).toHaveBeenCalledWith("event", "immediate", {
      source: "test",
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
});
