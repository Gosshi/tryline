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

import NewsletterConfirmedPage from "@/app/newsletter/confirmed/page";
import { NewsletterSignup } from "@/components/newsletter-signup";

type ObserverControl = {
  callback: IntersectionObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
  options: IntersectionObserverInit;
};

function installIntersectionObserver(): ObserverControl {
  let control: ObserverControl | null = null;

  class MockIntersectionObserver {
    constructor(
      callback: IntersectionObserverCallback,
      options: IntersectionObserverInit,
    ) {
      control = {
        callback,
        disconnect: vi.fn(),
        observe: vi.fn(),
        options,
      };
    }

    disconnect() {
      control?.disconnect();
    }

    observe(target: Element) {
      control?.observe(target);
    }

    takeRecords() {
      return [];
    }

    unobserve() {}
  }

  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

  return new Proxy({} as ObserverControl, {
    get(_, property: keyof ObserverControl) {
      if (!control) {
        throw new Error("IntersectionObserver was not created.");
      }
      return control[property];
    },
  });
}

function stubGtag() {
  const gtag = vi.fn();
  Object.defineProperty(window, "gtag", {
    configurable: true,
    value: gtag,
    writable: true,
  });
  return gtag;
}

function submitForm() {
  fireEvent.change(screen.getByLabelText("メールアドレス"), {
    target: { value: "fan@example.com" },
  });
  fireEvent.submit(screen.getByRole("button").closest("form")!);
}

describe("newsletter funnel instrumentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("tracks one view after the form is at least half visible", () => {
    const gtag = stubGtag();
    const observer = installIntersectionObserver();

    render(<NewsletterSignup source="calendar" />);

    expect(observer.options).toEqual({ threshold: 0.5 });
    expect(observer.observe).toHaveBeenCalledTimes(1);
    observer.callback(
      [
        {
          intersectionRatio: 0.5,
          isIntersecting: true,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );
    observer.callback(
      [
        {
          intersectionRatio: 1,
          isIntersecting: true,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );

    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith("event", "newsletter_view", {
      entry_surface: "calendar",
    });
    expect(observer.disconnect).toHaveBeenCalled();
  });

  it("tracks submit before fetch and records successful results", async () => {
    const calls: string[] = [];
    const gtag = stubGtag();
    gtag.mockImplementation((_, eventName) => calls.push(eventName));
    installIntersectionObserver();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls.push("fetch");
        return { ok: true, status: 200 };
      }),
    );

    render(<NewsletterSignup source="home" />);
    submitForm();

    await waitFor(() => {
      expect(gtag).toHaveBeenCalledWith("event", "newsletter_result", {
        entry_surface: "home",
        status: "ok",
      });
    });
    expect(calls).toEqual(["newsletter_submit", "fetch", "newsletter_result"]);
  });

  it.each([
    [{ ok: false, status: 429 }, "rate_limited"],
    [{ ok: false, status: 500 }, "error"],
  ] as const)("tracks %s API results", async (response, status) => {
    const gtag = stubGtag();
    installIntersectionObserver();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    render(<NewsletterSignup source="competition" />);
    submitForm();

    await waitFor(() => {
      expect(gtag).toHaveBeenCalledWith("event", "newsletter_result", {
        entry_surface: "competition",
        status,
      });
    });
  });

  it("tracks network failures", async () => {
    const gtag = stubGtag();
    installIntersectionObserver();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<NewsletterSignup source="calendar" />);
    submitForm();

    await waitFor(() => {
      expect(gtag).toHaveBeenCalledWith("event", "newsletter_result", {
        entry_surface: "calendar",
        status: "network_error",
      });
    });
  });

  it("keeps submission working without gtag or IntersectionObserver", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    Object.defineProperty(window, "gtag", {
      configurable: true,
      value: undefined,
      writable: true,
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    render(<NewsletterSignup source="home" />);
    submitForm();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText(
        "必要な手続きをメールでお知らせします。受信箱をご確認ください。",
      ),
    ).toBeInTheDocument();
  });

  it("tracks newsletter confirmation only after a completed confirmation redirect", async () => {
    const gtag = stubGtag();

    render(await NewsletterConfirmedPage({ searchParams: Promise.resolve({ completed: "1" }) }));

    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith("event", "newsletter_confirmed", {});
    expect(
      screen.getByRole("link", { name: "今週の試合を見る" }),
    ).toHaveAttribute("href", "/calendar");
  });

  it("does not track when the confirmed page is opened directly", async () => {
    const gtag = stubGtag();
    render(await NewsletterConfirmedPage({ searchParams: Promise.resolve({}) }));
    expect(gtag).not.toHaveBeenCalled();
  });
});
