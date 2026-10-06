export const SPOILER_GUARD_KEY = "tryline:spoiler-guard";
let storageUnavailable = false;
const CHANGE_EVENT = "tryline:spoiler-guard-change";

// Runs in <head>, before the body or React chunks. GA's automatic page_view
// (including history changes) inherits this parameter without a second event.
export const SPOILER_GUARD_BOOTSTRAP = `(function(){var state="off";try{if(localStorage.getItem("${SPOILER_GUARD_KEY}")==="on")state="on";}catch(e){}document.documentElement.dataset.spoilerGuard=state;window.dataLayer=window.dataLayer||[];window.dataLayer.push((function(){return arguments;})("set",{spoiler_guard:state}));})();`;

export function readSpoilerGuard(): boolean {
  if (storageUnavailable) return false;
  try {
    return window.localStorage.getItem(SPOILER_GUARD_KEY) === "on";
  } catch {
    return false;
  }
}

function applySpoilerGuard() {
  const state = readSpoilerGuard() ? "on" : "off";
  document.documentElement.dataset.spoilerGuard = state;
  const analyticsWindow = window as Window & { dataLayer?: unknown[] };
  analyticsWindow.dataLayer = analyticsWindow.dataLayer || [];
  if (typeof window.gtag === "function") {
    window.gtag("set", { spoiler_guard: state });
  } else {
    analyticsWindow.dataLayer.push(
      (function (..._args: unknown[]) {
        return arguments;
      })("set", { spoiler_guard: state }),
    );
  }
}

export function writeSpoilerGuard(enabled: boolean): boolean {
  try {
    window.localStorage.setItem(SPOILER_GUARD_KEY, enabled ? "on" : "off");
    storageUnavailable = false;
  } catch {
    // A blocked store is treated as off, even when its previous value was on.
    storageUnavailable = true;
    applySpoilerGuard();
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return false;
  }
  applySpoilerGuard();
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return readSpoilerGuard();
}

export function subscribeSpoilerGuard(onChange: () => void) {
  const storageChange = (event: StorageEvent) => {
    if (event.key === SPOILER_GUARD_KEY || event.key === null) {
      applySpoilerGuard();
      onChange();
    }
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", storageChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", storageChange);
  };
}
