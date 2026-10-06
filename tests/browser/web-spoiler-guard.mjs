// Evaluate via Playwright browser_evaluate on tools/test-web-spoiler-first-paint.py.
// React scripts are absent; only the actual app <head> bootstrap can set the guard.
() => {
  if (location.hostname !== "127.0.0.1" || location.port !== "3109") throw new Error("Use the local first-paint preview only");
  const params = new URLSearchParams(location.search);
  const state = params.get("state") ?? "off";
  const path = params.get("page") ?? "/";
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const scores = [...document.querySelectorAll("[data-spoiler-value]")];
  const visible = scores.filter((element) => element.getClientRects().length).length;
  check(scores.length > 0, "fixture must contain scores: " + path);
  check(document.documentElement.dataset.spoilerGuard === state, "head bootstrap missing or wrong preference: " + path);
  check(state === "on" ? visible === 0 && window.__spoilerLeaks.length === 0 : visible > 0, "score visible during first paint: " + path + " " + JSON.stringify(window.__spoilerLeaks));
  if (path.startsWith("/matches/")) {
    const spoilers = [...document.querySelectorAll('[data-spoiler-content="recap"], [data-spoiler-content="timeline"], [data-spoiler-content="events"]')];
    check(spoilers.length >= 3, "fixture must contain recap, timeline and events");
    check(spoilers.every((element) => !!element.getClientRects().length === (state === "off")), "finished content visibility incorrect: " + state);
  } else {
    check(!!document.querySelector('a[href="/matches/dcd576dd-f778-4690-b4e1-3d960bd664f1"]'), "SSR match link missing");
  }
  return { path, state, scores: scores.length, visible, leaks: window.__spoilerLeaks.length, reactScripts: [...document.scripts].filter((script) => script.src).length };
}
