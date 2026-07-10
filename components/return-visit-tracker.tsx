"use client";

import { useEffect } from "react";

import { trackReturnVisit } from "@/lib/analytics";

const LAST_VISIT_KEY = "tryline_last_visit_at";
const LAST_RETURN_EVENT_KEY = "tryline_last_return_visit_event_at";
const SESSION_RETURN_EVENT_KEY = "tryline_return_visit_tracked_in_session";
const RETURN_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_RETURN_VISIT_MS = 6 * 60 * 60 * 1000;

export function ReturnVisitTracker() {
  useEffect(() => {
    const now = Date.now();
    const previous = Number(localStorage.getItem(LAST_VISIT_KEY));
    const lastEvent = Number(localStorage.getItem(LAST_RETURN_EVENT_KEY));
    const alreadyTrackedInSession =
      sessionStorage.getItem(SESSION_RETURN_EVENT_KEY) === "1";

    if (Number.isFinite(previous) && previous > 0) {
      const elapsedMs = now - previous;
      const elapsedDays = elapsedMs / DAY_MS;
      const alreadyTrackedToday =
        Number.isFinite(lastEvent) && now - lastEvent < DAY_MS;

      if (
        elapsedMs >= MIN_RETURN_VISIT_MS &&
        elapsedDays <= RETURN_WINDOW_DAYS &&
        !alreadyTrackedToday &&
        !alreadyTrackedInSession
      ) {
        trackReturnVisit({
          days_since_last_visit: Math.max(1, Math.floor(elapsedDays)),
        });
        localStorage.setItem(LAST_RETURN_EVENT_KEY, String(now));
        sessionStorage.setItem(SESSION_RETURN_EVENT_KEY, "1");
      }
    }

    localStorage.setItem(LAST_VISIT_KEY, String(now));
  }, []);

  return null;
}
