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

import { SpoilerScore } from "@/components/spoiler-score";
import {
  MotionCountGate,
  MotionNumber,
  TouchlineMotion,
  TouchlineTickerButton,
} from "@/components/touchline-motion";

let reduced = false;
let preferenceChanged: (() => void) | undefined;
const observers: FakeObserver[] = [];

class FakeObserver {
  targets = new Set<Element>();
  constructor(private callback: IntersectionObserverCallback) {
    observers.push(this);
  }
  observe = (target: Element) => {
    this.targets.add(target);
  };
  unobserve = (target: Element) => {
    this.targets.delete(target);
  };
  disconnect = () => {
    this.targets.clear();
  };
  enter(target: Element, isIntersecting = true) {
    this.callback(
      [{ target, isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function fixture() {
  return (
    <TouchlineMotion page="home">
      <h1>
        <span data-tl-motion="headline">今週の海外ラグビー</span>
      </h1>
      <div data-tl-loop="poster" />
      <aside className="tl-ticker" data-tl-loop="ticker">
        <TouchlineTickerButton />
      </aside>
      <section aria-label="日程と順位">
        <ul>
          {Array.from({ length: 12 }, (_, index) => (
            <li key={index}>
              <a data-match-layout="row" href={`/matches/${index}`}>
                試合{index}
              </a>
            </li>
          ))}
        </ul>
        <table>
          <tbody>
            <tr>
              <td>チーム</td>
              <td>
                <MotionNumber value={14} />
              </td>
            </tr>
          </tbody>
        </table>
      </section>
      <section aria-label="読む">
        <h2>最近のレビュー</h2>
      </section>
    </TouchlineMotion>
  );
}

beforeEach(() => {
  reduced = false;
  preferenceChanged = undefined;
  observers.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return reduced;
    },
    addEventListener: (_: string, listener: () => void) => {
      preferenceChanged = listener;
    },
    removeEventListener: vi.fn(),
  }));
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Touchline motion", () => {
  it.each([
    { tops: [0, 0, 100], delays: ["0ms", "0ms", "100ms"] },
    { tops: [0, 100, 200], delays: ["0ms", "80ms", "160ms"] },
  ])(
    "staggers rendered headline lines rather than words ($tops)",
    ({ tops, delays }) => {
      const rect = vi
        .spyOn(Element.prototype, "getBoundingClientRect")
        .mockImplementation(function (this: Element) {
          return new DOMRect(0, Number(this.getAttribute("data-top")), 100, 40);
        });
      try {
        const { container } = render(
          <TouchlineMotion page="home">
            <h1>
              {tops.map((top, index) => (
                <span key={index} data-top={top} data-tl-motion="headline">
                  語{index}
                </span>
              ))}
            </h1>
          </TouchlineMotion>,
        );
        expect(
          [
            ...container.querySelectorAll<HTMLElement>(
              '[data-tl-motion="headline"]',
            ),
          ].map((node) => node.style.getPropertyValue("--tl-delay")),
        ).toEqual(delays);
      } finally {
        rect.mockRestore();
      }
    },
  );

  it("keeps final numbers, headings and all match links in server HTML without JS", () => {
    const html = renderToStaticMarkup(fixture());
    expect(html).toContain("今週の海外ラグビー");
    expect(html.match(/href="\/matches\//g)).toHaveLength(12);
    expect(html).toMatch(/data-tl-motion="count"[^>]*>14<\/span>/);
    expect(html).not.toContain("tl-count-track");
    expect(html).not.toContain("tl-running");
  });

  it("starts in view only once, with a single visible reel and a final accessible value", () => {
    const { container } = render(fixture());
    const count = container.querySelector('[data-tl-motion="count"]')!;
    expect(count).toHaveTextContent(/^14$/);
    act(() => observers[0]!.enter(count));
    expect(count).toHaveClass("tl-running");
    expect(count.querySelector(".sr-only")).toHaveTextContent(/^14$/);
    expect(count.querySelectorAll(".tl-count-window")).toHaveLength(1);
    expect(count.querySelector(".tl-count-window")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(count.children).toHaveLength(2);
    fireEvent.animationEnd(count.querySelector(".tl-count-track")!);
    expect(count).toHaveTextContent(/^14$/);
    expect(count.querySelector(".tl-count-track")).toBeNull();
    act(() => observers[0]!.enter(count));
    expect(count).not.toHaveClass("tl-running");
  });

  it("never starts finite animations or loops with reduced motion", () => {
    reduced = true;
    const { container } = render(fixture());
    act(() => {
      for (const target of observers[0]!.targets) observers[0]!.enter(target);
      for (const target of observers[1]!.targets) observers[1]!.enter(target);
    });
    expect(
      container.querySelector(".tl-running, .tl-loop-active, .tl-count-track"),
    ).toBeNull();
    expect(
      container.querySelector('[data-tl-motion="count"]'),
    ).toHaveTextContent(/^14$/);
  });

  it("restores final values immediately when reduced motion is enabled during a count", () => {
    const { container } = render(fixture());
    const count = container.querySelector('[data-tl-motion="count"]')!;
    act(() => observers[0]!.enter(count));
    act(() => {
      reduced = true;
      preferenceChanged?.();
    });
    expect(count).toHaveTextContent(/^14$/);
    expect(count).not.toHaveClass("tl-running");
    act(() => {
      reduced = false;
      preferenceChanged?.();
      observers[0]!.enter(count);
    });
    expect(count).not.toHaveClass("tl-running");
  });

  it("preserves readable schedule/rank ancestors and caps row staggering at 225ms", () => {
    render(fixture());
    const critical = screen.getByLabelText("日程と順位");
    expect(critical).not.toHaveAttribute("data-tl-motion", "reveal");
    expect(screen.getByLabelText("読む")).toHaveAttribute(
      "data-tl-motion",
      "reveal",
    );
    const rows = critical.querySelectorAll<HTMLElement>(
      '[data-match-layout="row"]',
    );
    expect(rows[0]!.style.getPropertyValue("--tl-delay")).toBe("0ms");
    expect(rows[1]!.style.getPropertyValue("--tl-delay")).toBe("25ms");
    expect(rows[11]!.style.getPropertyValue("--tl-delay")).toBe("225ms");
  });

  it("pauses loops offscreen and in inactive tabs without replaying finite motion", () => {
    const { container } = render(fixture());
    const loop = container.querySelector('[data-tl-loop="poster"]')!;
    act(() => observers[1]!.enter(loop));
    expect(loop).toHaveClass("tl-loop-active");
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    fireEvent(document, new Event("visibilitychange"));
    expect(loop).not.toHaveClass("tl-loop-active");
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    fireEvent(document, new Event("visibilitychange"));
    expect(loop).toHaveClass("tl-loop-active");
    act(() => observers[1]!.enter(loop, false));
    expect(loop).not.toHaveClass("tl-loop-active");
  });

  it("provides a keyboard-operable ticker pause and resume button", () => {
    render(fixture());
    const pause = screen.getByRole("button", {
      name: "試合と結果のスクロールを停止",
    });
    fireEvent.click(pause);
    expect(pause).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      screen.getByRole("button", { name: "試合と結果のスクロールを再開" }),
    );
    expect(pause).toHaveAttribute("aria-pressed", "false");
  });

  it("never counts guarded results, including after explicit reveal", () => {
    const { container } = render(
      <TouchlineMotion page="match">
        <SpoilerScore enabled>
          <MotionNumber value={42} />
        </SpoilerScore>
      </TouchlineMotion>,
    );
    expect(container).not.toHaveTextContent("42");
    expect(container.querySelector("[data-tl-motion='count']")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "タップして結果を見る" }),
    );
    const final = container.querySelector('[data-tl-motion="count-static"]')!;
    expect(final).toHaveTextContent(/^42$/);
    act(() => observers[0]!.enter(final));
    expect(container.querySelector(".tl-count-track, .tl-running")).toBeNull();
  });

  it("does not count before user settings resolve or outside a motion page", () => {
    const { container } = render(
      <TouchlineMotion page="match">
        <MotionCountGate disabled>
          <MotionNumber value={38} />
        </MotionCountGate>
      </TouchlineMotion>,
    );
    expect(
      container.querySelector('[data-tl-motion="count-static"]'),
    ).toHaveTextContent(/^38$/);
    const other = render(<MotionNumber value={10} />);
    expect(
      other.container.querySelector('[data-tl-motion="count-static"]'),
    ).toHaveTextContent(/^10$/);
  });

  it("removes a running score immediately if spoiler guard is enabled", () => {
    const content = (enabled: boolean) => (
      <TouchlineMotion page="match">
        <SpoilerScore enabled={enabled}>
          <MotionNumber value={42} />
        </SpoilerScore>
      </TouchlineMotion>
    );
    const { container, rerender } = render(content(false));
    const count = container.querySelector('[data-tl-motion="count"]')!;
    act(() => observers[0]!.enter(count));
    expect(count.querySelector(".tl-count-track")).not.toBeNull();
    rerender(content(true));
    expect(container.querySelector(".tl-number, .tl-count-track")).toBeNull();
    expect(container).not.toHaveTextContent("42");
    act(() => vi.advanceTimersByTime(700));
    expect(container).not.toHaveTextContent("42");
    fireEvent.click(
      screen.getByRole("button", { name: "タップして結果を見る" }),
    );
    expect(
      container.querySelector('[data-tl-motion="count-static"]'),
    ).toHaveTextContent(/^42$/);
    expect(container.querySelector(".tl-count-track")).toBeNull();
  });

  it("keeps zero and negative points static and bounds a large temporary reel", () => {
    const { container } = render(
      <TouchlineMotion page="season">
        <MotionNumber value={0} />
        <MotionNumber value={-5} />
        <MotionNumber value={999} />
      </TouchlineMotion>,
    );
    expect(
      container.querySelectorAll('[data-tl-motion="count-static"]'),
    ).toHaveLength(2);
    const count = container.querySelector('[data-tl-motion="count"]')!;
    act(() => observers[0]!.enter(count));
    expect(count.querySelectorAll(".tl-count-track > span")).toHaveLength(61);
    expect(
      count.querySelector(".tl-count-track")!.lastElementChild,
    ).toHaveTextContent(/^999$/);
    act(() => vi.advanceTimersByTime(600));
    expect(count).toHaveTextContent(/^999$/);
  });

  it("falls back to the final server state if IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { container } = render(fixture());
    expect(container.querySelector(".tl-enhanced")).toBeNull();
    expect(
      container.querySelector('[data-tl-motion="count"]'),
    ).toHaveTextContent(/^14$/);
  });
});
