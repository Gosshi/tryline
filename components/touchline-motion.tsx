"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

const MotionScope = createContext(false);
const CountBlocked = createContext(false);
const START = "touchline-motion-start";
const FINISH = "touchline-motion-finish";

export function MotionCountGate({
  disabled,
  children,
}: {
  disabled: boolean;
  children: ReactNode;
}) {
  const parentBlocked = useContext(CountBlocked);
  return (
    <CountBlocked.Provider value={parentBlocked || disabled}>
      {children}
    </CountBlocked.Provider>
  );
}

/** SSR and the completed animation both contain only the real final number. */
export function MotionNumber({ value }: { value: number }) {
  const scoped = useContext(MotionScope);
  const blocked = useContext(CountBlocked);
  const ref = useRef<HTMLSpanElement>(null);
  const [running, setRunning] = useState(false);
  const eligible = scoped && !blocked && Number.isInteger(value) && value > 0;
  // Bound the temporary reel even for unusually large scores/points.
  const steps = Math.min(Math.max(value, 1), 60);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const start = () => setRunning(true);
    const finish = () => setRunning(false);
    node.addEventListener(START, start);
    node.addEventListener(FINISH, finish);
    return () => {
      node.removeEventListener(START, start);
      node.removeEventListener(FINISH, finish);
    };
  }, []);

  return (
    <span
      className="tl-number"
      data-tl-motion={eligible ? "count" : "count-static"}
      ref={ref}
      style={
        {
          "--tl-digits": Math.max(String(value).length, 2),
          "--tl-end": `${-steps * 1.1}em`,
          "--tl-steps": steps,
        } as CSSProperties
      }
    >
      {running && eligible ? (
        <>
          <span className="sr-only">{value}</span>
          <span aria-hidden="true" className="tl-count-window">
            <span className="tl-count-track">
              {Array.from({ length: steps + 1 }, (_, index) => (
                <span key={index}>{Math.round((index * value) / steps)}</span>
              ))}
            </span>
          </span>
        </>
      ) : (
        value
      )}
    </span>
  );
}

export function TouchlineTickerButton() {
  const [paused, setPaused] = useState(false);
  return (
    <button
      aria-label={`試合と結果のスクロールを${paused ? "再開" : "停止"}`}
      aria-pressed={paused}
      className="tl-ticker-pause focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      onClick={() => setPaused(!paused)}
      type="button"
    >
      <span aria-hidden="true">{paused ? "▶" : "Ⅱ"}</span>
    </button>
  );
}

/** One observer/controller per page; no server content depends on its startup. */
export function TouchlineMotion({
  children,
  className = "",
  page,
}: {
  children: ReactNode;
  className?: string;
  page: "home" | "season" | "match";
}) {
  const ref = useRef<HTMLElement>(null);
  const seen = useRef(new WeakSet<Element>());

  useEffect(() => {
    const root = ref.current;
    if (!root || !window.IntersectionObserver || !window.matchMedia) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const active = new Map<Element, ReturnType<typeof setTimeout>>();
    const visibleLoops = new Set<Element>();
    const observed = new WeakSet<Element>();
    const resizedLaps = new WeakSet<Element>();

    function measureTickers() {
      root
        ?.querySelectorAll<HTMLElement>('[data-tl-loop="ticker"]')
        .forEach((ticker) => {
          const lap = ticker.querySelector<HTMLElement>(".tl-ticker-lap");
          const width = reduced.matches
            ? 0
            : (lap?.getBoundingClientRect().width ?? 0);
          if (width > 0) {
            ticker.style.setProperty("--tl-ticker-duration", `${width / 40}s`);
            ticker.classList.add("tl-ticker-measured");
          } else {
            ticker.style.removeProperty("--tl-ticker-duration");
            ticker.classList.remove("tl-ticker-measured");
          }
          if (lap && resizeObserver && !resizedLaps.has(lap)) {
            resizedLaps.add(lap);
            resizeObserver.observe(lap);
          }
        });
    }
    const resizeObserver = window.ResizeObserver
      ? new ResizeObserver(measureTickers)
      : null;

    function finish(node: Element) {
      clearTimeout(active.get(node));
      active.delete(node);
      node.classList.remove("tl-running");
      node.dispatchEvent(new Event(FINISH));
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const node = entry.target as HTMLElement;
          if (!entry.isIntersecting || seen.current.has(node)) continue;
          if (
            !node.isConnected ||
            node.closest("[hidden], details:not([open])")
          )
            continue;
          if (node.dataset.tlMotion === "count-static") continue;
          seen.current.add(node);
          observer.unobserve(node);
          if (reduced.matches) continue;
          node.classList.add("tl-running");
          node.dispatchEvent(new Event(START));
          // Animationend is primary; the timer restores final content even if
          // an animation is cancelled or the document becomes inactive.
          active.set(
            node,
            setTimeout(() => finish(node), 600),
          );
        }
      },
      { threshold: 0.05 },
    );

    function syncLoops() {
      for (const node of visibleLoops) {
        node.classList.toggle(
          "tl-loop-active",
          !document.hidden && !reduced.matches,
        );
      }
    }

    const loopObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visibleLoops.add(entry.target);
        else {
          visibleLoops.delete(entry.target);
          entry.target.classList.remove("tl-loop-active");
        }
      }
      syncLoops();
    });

    function scan() {
      if (!root) return;
      measureTickers();
      const headlines = Array.from(
        root.querySelectorAll<HTMLElement>('[data-tl-motion="headline"]'),
      );
      if (headlines.some((node) => !observed.has(node))) {
        const tops = headlines.map((node) =>
          Math.round(node.getBoundingClientRect().top),
        );
        const lines = [...new Set(tops)];
        headlines.forEach((node, index) => {
          const delay =
            lines.indexOf(tops[index]!) * (lines.length > 2 ? 80 : 100);
          node.style.setProperty("--tl-delay", `${Math.min(delay, 160)}ms`);
        });
      }
      // Data-bearing rows never fade, nor do their section ancestors.
      const reveals =
        page === "home"
          ? "section:not(:has([data-match-layout], table, [data-tl-loop])), [data-review-size]"
          : page === "season"
            ? "#guide h2, #guide h3"
            : "h2, h3";
      root.querySelectorAll<HTMLElement>(reveals).forEach((node) => {
        if (!node.dataset.tlMotion && !node.closest("[data-tl-score]"))
          node.dataset.tlMotion = "reveal";
      });
      root
        .querySelectorAll<HTMLElement>(
          "[data-match-layout], tbody tr:not([aria-label])",
        )
        .forEach((node) => {
          if (node.dataset.tlMotion !== "row") node.dataset.tlMotion = "row";
          const list = node.closest("ul, tbody");
          const rows = list
            ? Array.from(
                list.querySelectorAll(
                  "[data-match-layout], tr:not([aria-label])",
                ),
              )
            : [node];
          node.style.setProperty(
            "--tl-delay",
            `${Math.min(rows.indexOf(node) * 25, 225)}ms`,
          );
        });
      root
        .querySelectorAll(
          "[data-tl-motion]:not([data-tl-motion='count-static'])",
        )
        .forEach((node) => {
          if (!observed.has(node)) {
            observed.add(node);
            observer.observe(node);
          }
        });
      root.querySelectorAll("[data-tl-loop]").forEach((node) => {
        if (!observed.has(node)) {
          observed.add(node);
          loopObserver.observe(node);
        }
      });
    }

    function onEnd(event: AnimationEvent) {
      const target = event.target as Element;
      const owner = target.closest("[data-tl-motion]");
      if (owner && active.has(owner)) finish(owner);
    }
    function onPreferenceChange() {
      if (reduced.matches) for (const node of active.keys()) finish(node);
      measureTickers();
      syncLoops();
    }
    root.classList.add("tl-enhanced");
    scan();
    const mutations = new MutationObserver(scan);
    mutations.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-tl-motion"],
    });
    root.addEventListener("animationend", onEnd);
    document.addEventListener("visibilitychange", syncLoops);
    window.addEventListener("resize", measureTickers);
    reduced.addEventListener("change", onPreferenceChange);
    return () => {
      observer.disconnect();
      loopObserver.disconnect();
      mutations.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureTickers);
      root
        .querySelectorAll<HTMLElement>('[data-tl-loop="ticker"]')
        .forEach((ticker) => {
          ticker.style.removeProperty("--tl-ticker-duration");
          ticker.classList.remove("tl-ticker-measured");
        });
      root.removeEventListener("animationend", onEnd);
      document.removeEventListener("visibilitychange", syncLoops);
      reduced.removeEventListener("change", onPreferenceChange);
      for (const node of active.keys()) finish(node);
      for (const node of visibleLoops) node.classList.remove("tl-loop-active");
      root.classList.remove("tl-enhanced");
    };
  }, [page]);

  return (
    <MotionScope.Provider value={true}>
      <main className={`${className} tl-scope`} data-tl-page={page} ref={ref}>
        {children}
      </main>
    </MotionScope.Provider>
  );
}
