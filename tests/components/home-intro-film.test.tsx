// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
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
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute("open");
        this.dispatchEvent(new Event("close"));
      },
    },
  });
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
    expect(html).toContain("拡大して見る");
    expect(html).not.toContain("<dialog open");
    expect(html).not.toContain("controls=");
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
    expect(
      screen.queryByRole("button", { name: /^紹介動画を(再生|一時停止)$/ }),
    ).not.toBeInTheDocument();
  });

  it("falls back to the poster after a media error", () => {
    render(<HomeIntroFilm />);
    fireEvent.error(video());
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "/videos/tryline-promo-poster.jpg",
    );
    expect(
      screen.queryByRole("button", { name: /^紹介動画を(再生|一時停止)$/ }),
    ).not.toBeInTheDocument();
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

  it.each([
    { viewportWidth: 390, reduce: false },
    { viewportWidth: 1440, reduce: true },
  ])(
    "loads the dialog only on explicit expansion at $viewportWidth px, reduce=$reduce",
    ({ viewportWidth, reduce }) => {
      width = viewportWidth;
      reduced = reduce;
      render(<HomeIntroFilm />);
      expect(video()).not.toHaveAttribute("src");
      expect(document.querySelector("dialog video")).toBeNull();
      const expand = screen.getByRole("button", { name: "拡大して見る" });
      fireEvent.click(expand);
      const dialog = screen.getByRole("dialog", {
        name: "Tryline の紹介動画を拡大",
      });
      const largeVideo = within(dialog).getByLabelText(
        "サイトとアプリの紹介・拡大表示（音なし）",
      ) as HTMLVideoElement;
      expect(largeVideo).toHaveAttribute(
        "src",
        "/videos/tryline-promo-720p.mp4",
      );
      expect(largeVideo.controls).toBe(true);
      expect(largeVideo.muted).toBe(true);
      expect(largeVideo.playsInline).toBe(true);
      expect(video()).not.toHaveAttribute("src");
      expect(
        within(dialog).getByRole("button", { name: "閉じる" }),
      ).toHaveFocus();
      fireEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(document.querySelector("dialog video")).toBeNull();
      expect(expand).toHaveFocus();
      expect(video()).not.toHaveAttribute("src");
    },
  );

  it("closes on native cancel and restores the expansion trigger focus", () => {
    render(<HomeIntroFilm />);
    const expand = screen.getByRole("button", { name: "拡大して見る" });
    fireEvent.click(expand);
    const dialog = screen.getByRole("dialog");
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(expand).toHaveFocus();
  });

  it("pauses the inline video during expansion and restores playback on close", () => {
    render(<HomeIntroFilm />);
    const inlineVideo = video();
    const pause = vi.spyOn(inlineVideo, "pause");
    fireEvent.click(screen.getByRole("button", { name: "拡大して見る" }));
    expect(pause).toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "閉じる",
      }),
    );
    expect(
      screen.getByRole("button", { name: "紹介動画を一時停止" }),
    ).toBeInTheDocument();
  });

  it("keeps an intentionally paused inline video paused after closing", () => {
    render(<HomeIntroFilm />);
    fireEvent.click(screen.getByRole("button", { name: "紹介動画を一時停止" }));
    const play = vi.spyOn(video(), "play");
    play.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "拡大して見る" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "閉じる",
      }),
    );
    expect(play).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "紹介動画を再生" }),
    ).toBeInTheDocument();
  });

  it("falls back to the poster within the dialog on error and can close", () => {
    render(<HomeIntroFilm />);
    fireEvent.click(screen.getByRole("button", { name: "拡大して見る" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.error(
      within(dialog).getByLabelText("サイトとアプリの紹介・拡大表示（音なし）"),
    );
    expect(within(dialog).getByRole("img")).toHaveAttribute(
      "src",
      "/videos/tryline-promo-poster.jpg",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    { viewportWidth: 390, reduce: false },
    { viewportWidth: 1440, reduce: false },
    { viewportWidth: 1440, reduce: true },
  ])(
    "expands from the video surface and returns focus to that trigger at $viewportWidth px, reduce=$reduce",
    ({ viewportWidth, reduce }) => {
      width = viewportWidth;
      reduced = reduce;
      render(<HomeIntroFilm />);
      const surface = screen.getByRole("button", {
        name: "紹介動画を拡大して見る",
      });
      expect(surface.tagName).toBe("BUTTON");
      expect(surface).toHaveAttribute("type", "button");
      expect(surface).toBeEnabled();
      expect(surface.querySelector("button")).toBeNull();
      fireEvent.click(surface);
      const dialog = screen.getByRole("dialog");
      expect(
        within(dialog).getByLabelText(
          "サイトとアプリの紹介・拡大表示（音なし）",
        ),
      ).toHaveAttribute("src", "/videos/tryline-promo-720p.mp4");
      fireEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
      expect(surface).toHaveFocus();
      expect(document.querySelector("dialog video")).toBeNull();
    },
  );

  it("keeps the playback button separate from the surface expansion button", () => {
    render(<HomeIntroFilm />);
    const surface = screen.getByRole("button", {
      name: "紹介動画を拡大して見る",
    });
    const pause = screen.getByRole("button", { name: "紹介動画を一時停止" });
    expect(surface.contains(pause)).toBe(false);
    fireEvent.click(pause);
    expect(video().paused).toBe(true);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "紹介動画を再生" }));
    expect(video().paused).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["紹介動画を拡大して見る", "拡大して見る"])(
    "restores %s focus without scrolling the clipped hero",
    (name) => {
      render(<HomeIntroFilm />);
      const trigger = screen.getByRole("button", { name });
      fireEvent.click(trigger);
      const focus = vi.spyOn(trigger, "focus");
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", {
          name: "閉じる",
        }),
      );
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      expect(trigger).toHaveFocus();
    },
  );
});
