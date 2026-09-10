// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  observers: [] as Array<{
    callback: IntersectionObserverCallback;
    disconnect: ReturnType<typeof vi.fn>;
    observe: ReturnType<typeof vi.fn>;
  }>,
  trackPaywallView: vi.fn(),
  userState: { user: null as { id: string } | null },
}));

vi.mock("@/components/user-state-provider", () => ({
  useUserState: () => mocks.userState,
}));

vi.mock("@/lib/analytics", () => ({
  trackPaywallView: mocks.trackPaywallView,
}));

import { MatchContent } from "@/components/match-content";

const content = {
  contentMdJa: "# 概要\n\n無料本文\n\n# 続き\n\n有料本文",
  contentType: "preview" as const,
  generatedAt: "2027-02-04T14:12:00.000Z",
  modelVersion: "gpt-4o-2024-11-20",
  promptVersion: "preview@1.0.0",
};

describe("MatchContent paywall view tracking", () => {
  beforeEach(() => {
    mocks.observers = [];
    mocks.trackPaywallView.mockReset();
    mocks.userState.user = null;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        readonly disconnect = vi.fn();
        readonly observe = vi.fn();

        constructor(callback: IntersectionObserverCallback) {
          mocks.observers.push({
            callback,
            disconnect: this.disconnect,
            observe: this.observe,
          });
        }
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function enterBoundary(observerIndex = 0) {
    const observer = mocks.observers[observerIndex];
    if (!observer) {
      throw new Error("Expected an IntersectionObserver instance");
    }

    act(() => {
      observer.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
  }

  it("waits for the article boundary to enter the viewport, then tracks it once with its comparison axes", () => {
    const { rerender } = render(
      <MatchContent
        content={content}
        contentType="preview"
        isPremium={false}
        isSample
        matchId="match-1"
      />,
    );

    expect(mocks.trackPaywallView).not.toHaveBeenCalled();
    expect(mocks.observers).toHaveLength(1);

    enterBoundary();

    expect(mocks.trackPaywallView).toHaveBeenCalledTimes(1);
    expect(mocks.trackPaywallView).toHaveBeenCalledWith({
      content_type: "preview",
      is_sample: true,
      match_id: "match-1",
      paywall_location: "match_content_locked_blocks",
      viewer_type: "anonymous",
    });

    enterBoundary();
    expect(mocks.trackPaywallView).toHaveBeenCalledTimes(1);

    rerender(
      <MatchContent
        content={content}
        contentType="preview"
        isPremium={false}
        isSample
        matchId="match-1"
      />,
    );

    enterBoundary();
    expect(mocks.trackPaywallView).toHaveBeenCalledTimes(1);
  });

  it("does not observe while loading", () => {
    render(
      <MatchContent
        content={content}
        contentType="preview"
        isPremium={false}
        lockedLoading
        matchId="match-1"
      />,
    );
    expect(mocks.trackPaywallView).not.toHaveBeenCalled();
    expect(mocks.observers).toHaveLength(0);
  });

  it("does not observe premium content", () => {
    render(
      <MatchContent
        content={content}
        contentType="preview"
        isPremium
        matchId="match-1"
      />,
    );
    expect(mocks.trackPaywallView).not.toHaveBeenCalled();
    expect(mocks.observers).toHaveLength(0);
  });

  it("does not observe an article without locked blocks", () => {
    render(
      <MatchContent
        content={{ ...content, contentMdJa: "# 概要\n\n無料本文" }}
        contentType="preview"
        isPremium={false}
        matchId="match-1"
      />,
    );

    expect(mocks.trackPaywallView).not.toHaveBeenCalled();
    expect(mocks.observers).toHaveLength(0);
  });
});
