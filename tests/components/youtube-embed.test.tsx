// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const allowlist = vi.hoisted(() => ({ ids: [] as string[] }));

vi.mock("@/lib/youtube/allowed-channels", () => ({
  YOUTUBE_ALLOWED_CHANNEL_IDS: allowlist.ids,
}));

import { YouTubeEmbed } from "@/components/youtube-embed";

describe("YouTubeEmbed", () => {
  beforeEach(() => {
    allowlist.ids.splice(0);
  });

  afterEach(() => {
    cleanup();
  });

  it("falls back to a normal YouTube link for a channel outside the allowlist", () => {
    render(
      <YouTubeEmbed
        channelId="not-allowed"
        title="ハイライト"
        videoId="dQw4w9WgXcQ"
      />,
    );

    expect(
      screen.getByRole("link", { name: "ハイライトをYouTubeで見る" }),
    ).toHaveAttribute("href", "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(screen.queryByTitle("ハイライト")).not.toBeInTheDocument();
  });

  it("shows only a thumbnail before click for an allowed channel", () => {
    allowlist.ids.push("official-channel");

    render(
      <YouTubeEmbed
        channelId="official-channel"
        title="公式ハイライト"
        videoId="dQw4w9WgXcQ"
      />,
    );

    expect(
      screen.getByRole("button", { name: "公式ハイライトを再生" }),
    ).toBeInTheDocument();
    expect(screen.queryByTitle("公式ハイライト")).not.toBeInTheDocument();
  });

  it("loads the privacy-enhanced player only after click", () => {
    allowlist.ids.push("official-channel");

    render(
      <YouTubeEmbed
        channelId="official-channel"
        title="公式ハイライト"
        videoId="dQw4w9WgXcQ"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "公式ハイライトを再生" }),
    );

    expect(screen.getByTitle("公式ハイライト")).toHaveAttribute(
      "src",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
    );
  });
});
