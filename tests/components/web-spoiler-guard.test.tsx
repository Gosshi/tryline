// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import Link from "next/link";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MatchSpoilerBoundary } from "@/components/match-spoiler-boundary";
import { SpoilerGuardToggle } from "@/components/spoiler-guard-toggle";
import { SpoilerScore } from "@/components/spoiler-score";
import {
  SPOILER_GUARD_BOOTSTRAP,
  SPOILER_GUARD_KEY,
  readSpoilerGuard,
  writeSpoilerGuard,
} from "@/lib/spoiler-guard";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  writeSpoilerGuard(false);
});

describe("browser spoiler guard", () => {
  it("defaults off, synchronizes signed-out toggles, persists and emits one event per action", () => {
    window.gtag = vi.fn();
    render(
      <>
        <SpoilerGuardToggle location="site_header" />
        <SpoilerGuardToggle location="mobile_menu" />
        <SpoilerScore location="home_board">
          <Link href="/matches/example">31–19</Link>
        </SpoilerScore>
      </>,
    );
    const toggles = screen.getAllByRole("button", {
      name: "スコアを隠す オフ",
    });
    expect(screen.getByText("31–19")).toBeVisible();
    fireEvent.click(toggles[0]!);
    expect(localStorage.getItem(SPOILER_GUARD_KEY)).toBe("on");
    expect(screen.getByText("31–19")).not.toBeVisible();
    expect(
      screen.getAllByRole("button", { name: "スコアを隠す オン" }),
    ).toHaveLength(2);
    expect(window.gtag).toHaveBeenCalledWith("event", "spoiler_guard_toggle", {
      state: "on",
      cta_location: "site_header",
    });
    expect(
      vi
        .mocked(window.gtag)
        .mock.calls.filter((call) => call[1] === "spoiler_guard_toggle"),
    ).toHaveLength(1);
    expect(window.gtag).toHaveBeenCalledWith("set", { spoiler_guard: "on" });
    fireEvent.click(
      screen.getByRole("button", { name: "タップして結果を見る" }),
    );
    expect(screen.getByText("31–19")).toBeVisible();
    expect(window.gtag).toHaveBeenCalledWith("event", "spoiler_reveal", {
      cta_location: "home_board",
    });
    fireEvent.click(toggles[1]!);
    expect(localStorage.getItem(SPOILER_GUARD_KEY)).toBe("off");
    fireEvent.click(toggles[1]!);
    expect(screen.getByText("31–19")).not.toBeVisible();
  });

  it("survives denied reads and writes and treats the preference as off", () => {
    const get = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const set = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    expect(readSpoilerGuard()).toBe(false);
    render(<SpoilerGuardToggle location="site_header" />);
    fireEvent.click(screen.getByRole("button", { name: "スコアを隠す オフ" }));
    expect(document.documentElement).toHaveAttribute(
      "data-spoiler-guard",
      "off",
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
    expect(() => window.eval(SPOILER_GUARD_BOOTSTRAP)).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });

  it("bootstrap sets the preference and page_view parameter before React starts", () => {
    localStorage.setItem(SPOILER_GUARD_KEY, "on");
    window.eval(SPOILER_GUARD_BOOTSTRAP);
    expect(document.documentElement).toHaveAttribute(
      "data-spoiler-guard",
      "on",
    );
    const layer = (window as unknown as { dataLayer: ArrayLike<unknown>[] })
      .dataLayer;
    expect(Array.from(layer.at(-1)!)).toEqual(["set", { spoiler_guard: "on" }]);
  });

  it("reveals the finished score, recap, graph, events and statistics together, leaving the preview accessible", () => {
    writeSpoilerGuard(true);
    window.gtag = vi.fn();
    const page = (
      <MatchSpoilerBoundary finished>
        <SpoilerScore>
          <span>31–19</span>
        </SpoilerScore>
        <p data-spoiler-content="recap">勝利したレビュー本文</p>
        <div data-spoiler-content="timeline">得点推移</div>
        <div data-spoiler-content="events">得点経過</div>
        <div data-spoiler-content="stats">試合の数字</div>
        <div>試合前プレビュー</div>
      </MatchSpoilerBoundary>
    );
    const { unmount } = render(page);
    for (const text of [
      "31–19",
      "勝利したレビュー本文",
      "得点推移",
      "得点経過",
      "試合の数字",
    ])
      expect(screen.getByText(text)).not.toBeVisible();
    expect(screen.getByText("試合前プレビュー")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "スコアを表示" }));
    for (const text of [
      "31–19",
      "勝利したレビュー本文",
      "得点推移",
      "得点経過",
      "試合の数字",
    ])
      expect(screen.getByText(text)).toBeVisible();
    expect(
      vi
        .mocked(window.gtag)
        .mock.calls.filter((call) => call[1] === "spoiler_reveal"),
    ).toEqual([["event", "spoiler_reveal", { cta_location: "match_header" }]]);
    unmount();
    render(page);
    expect(screen.getByText("勝利したレビュー本文")).not.toBeVisible();
  });

  it("responds to storage changes in another tab", () => {
    render(<SpoilerGuardToggle location="site_header" />);
    act(() => {
      localStorage.setItem(SPOILER_GUARD_KEY, "on");
      window.dispatchEvent(
        new StorageEvent("storage", { key: SPOILER_GUARD_KEY }),
      );
    });
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement).toHaveAttribute(
      "data-spoiler-guard",
      "on",
    );
  });

  it.each([false, true])(
    "retains scores and match links in server HTML with preference %s",
    (enabled) => {
      writeSpoilerGuard(enabled);
      const html = renderToString(
        <SpoilerScore>
          <Link href="/matches/example">31–19</Link>
        </SpoilerScore>,
      );
      expect(html).toContain("31–19");
      expect(html).toContain('href="/matches/example"');
      expect(html).toContain("data-spoiler-value");
    },
  );
});
