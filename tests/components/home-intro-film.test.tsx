// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeIntroFilm } from "@/components/home-intro-film";

let width = 1440;
let reduced = false;
const mediaListeners = new Map<string, Set<() => void>>();
let paused = true;

beforeEach(() => {
  width = 1440;
  reduced = false;
  paused = true;
  mediaListeners.clear();
  vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query.includes("min-width") ? width >= 701 : reduced;
    },
    addEventListener: (_: string, listener: () => void) => {
      const listeners = mediaListeners.get(query) ?? new Set<() => void>();
      listeners.add(listener);
      mediaListeners.set(query, listeners);
    },
    removeEventListener: (_: string, listener: () => void) => {
      const listeners = mediaListeners.get(query);
      listeners?.delete(listener);
      if (listeners?.size === 0) mediaListeners.delete(query);
    },
  }));
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get").mockImplementation(
    () => paused,
  );
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    paused = false;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    paused = true;
    this.dispatchEvent(new Event("pause"));
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function video() {
  return screen.getByLabelText(
    "サイトとアプリの紹介（音なし）",
  ) as HTMLVideoElement;
}

function changeMedia(nextWidth: number, nextReduced: boolean) {
  act(() => {
    width = nextWidth;
    reduced = nextReduced;
    mediaListeners.forEach((listeners) =>
      listeners.forEach((listener) => listener()),
    );
  });
}

describe("HomeIntroFilm", () => {
  it("renders a dimensioned poster without any video source in server HTML", () => {
    const html = renderToStaticMarkup(<HomeIntroFilm />);
    expect(html).toContain('poster="/videos/tryline-promo-poster.jpg"');
    expect(html).toContain('width="1280"');
    expect(html).toContain('height="720"');
    expect(html).toContain('preload="none"');
    expect(html).not.toContain("src=");
    expect(html).not.toMatch(/fetchpriority|loading="lazy"/i);
    expect(html).not.toContain("<button");
  });

  it.each([390, 700])("does not load the video at %ipx", (viewportWidth) => {
    width = viewportWidth;
    render(<HomeIntroFilm />);
    expect(video()).not.toHaveAttribute("src");
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("does not load the video when reduced motion is enabled", () => {
    reduced = true;
    render(<HomeIntroFilm />);
    expect(video()).not.toHaveAttribute("src");
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it.each([701, 1440])(
    "starts the muted, inline, looping video at %ipx after load",
    (viewportWidth) => {
      width = viewportWidth;
      render(<HomeIntroFilm />);
      expect(video()).toHaveAttribute("src", "/videos/tryline-promo-720p.mp4");
      expect(video().muted).toBe(true);
      expect(video().loop).toBe(true);
      expect(video().playsInline).toBe(true);
      expect(video().autoplay).toBe(true);
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    },
  );

  it("waits for the page load event before adding a source", () => {
    const state = vi
      .spyOn(document, "readyState", "get")
      .mockReturnValue("loading");
    render(<HomeIntroFilm />);
    expect(video()).not.toHaveAttribute("src");
    state.mockReturnValue("complete");
    fireEvent(window, new Event("load"));
    expect(video()).toHaveAttribute("src");
  });

  it("pauses and resumes with accessible button state", () => {
    render(<HomeIntroFilm />);
    fireEvent.click(screen.getByRole("button", { name: "紹介動画を一時停止" }));
    expect(video().paused).toBe(true);
    expect(
      screen.getByRole("button", { name: "紹介動画を再生" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "紹介動画を再生" }));
    expect(video().paused).toBe(false);
    expect(
      screen.getByRole("button", { name: "紹介動画を一時停止" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("removes the source and stops when viewport or motion preferences change", () => {
    render(<HomeIntroFilm />);
    changeMedia(700, false);
    expect(video()).not.toHaveAttribute("src");
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
    changeMedia(701, false);
    expect(video()).toHaveAttribute("src");
    changeMedia(1440, true);
    expect(video()).not.toHaveAttribute("src");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("falls back to the poster after a media error", () => {
    render(<HomeIntroFilm />);
    fireEvent.error(video());
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "/videos/tryline-promo-poster.jpg",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("サイトとアプリの紹介（音なし）"),
    ).not.toBeInTheDocument();
    changeMedia(700, false);
    changeMedia(1440, false);
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("keeps a play button when autoplay is blocked", async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(
      new Error("NotAllowedError"),
    );
    render(<HomeIntroFilm />);
    await act(async () => {});
    expect(
      screen.getByRole("button", { name: "紹介動画を再生" }),
    ).toBeInTheDocument();
  });

  it("cleans up listeners and playback on unmount", () => {
    const { unmount } = render(<HomeIntroFilm />);
    expect(mediaListeners.size).toBe(2);
    unmount();
    expect(mediaListeners.size).toBe(0);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });
});
