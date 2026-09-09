// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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
    mocks.trackPaywallView.mockReset();
    mocks.userState.user = null;
  });

  afterEach(cleanup);

  it("tracks the visible article boundary once with its comparison axes", () => {
    const { rerender } = render(
      <MatchContent
        content={content}
        contentType="preview"
        isPremium={false}
        isSample
        matchId="match-1"
      />,
    );

    expect(mocks.trackPaywallView).toHaveBeenCalledTimes(1);
    expect(mocks.trackPaywallView).toHaveBeenCalledWith({
      content_type: "preview",
      is_sample: true,
      match_id: "match-1",
      paywall_location: "match_content_locked_blocks",
      viewer_type: "anonymous",
    });

    rerender(
      <MatchContent
        content={content}
        contentType="preview"
        isPremium={false}
        isSample
        matchId="match-1"
      />,
    );
    expect(mocks.trackPaywallView).toHaveBeenCalledTimes(1);
  });

  it("does not track the loading skeleton or premium content", () => {
    const { rerender } = render(
      <MatchContent
        content={content}
        contentType="preview"
        isPremium={false}
        lockedLoading
        matchId="match-1"
      />,
    );
    expect(mocks.trackPaywallView).not.toHaveBeenCalled();

    rerender(
      <MatchContent
        content={content}
        contentType="preview"
        isPremium
        matchId="match-1"
      />,
    );
    expect(mocks.trackPaywallView).not.toHaveBeenCalled();
  });
});
