"use client";

import { useEffect } from "react";

import { trackReturnVisit } from "@/lib/analytics";

const LAST_VISIT_KEY = "tryline_last_visit_at";
const LAST_RETURN_EVENT_KEY = "tryline_last_return_visit_event_at";
const RETURN_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function ReturnVisitTracker() {
  useEffect(() => {
    const now = Date.now();
    const previous = Number(localStorage.getItem(LAST_VISIT_KEY));
    const lastEvent = Number(localStorage.getItem(LAST_RETURN_EVENT_KEY));

    if (Number.isFinite(previous) && previous > 0) {
      const elapsedDays = (now - previous) / DAY_MS;
      const alreadyTrackedToday =
        Number.isFinite(lastEvent) && now - lastEvent < DAY_MS;

      if (
        elapsedDays > 0 &&
        elapsedDays <= RETURN_WINDOW_DAYS &&
        !alreadyTrackedToday
      ) {
        trackReturnVisit({
          days_since_last_visit: Math.max(1, Math.floor(elapsedDays)),
        });
        localStorage.setItem(LAST_RETURN_EVENT_KEY, String(now));
      }
    }

    localStorage.setItem(LAST_VISIT_KEY, String(now));
  }, []);

  return null;
}
