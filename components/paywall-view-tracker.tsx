"use client";

import { useEffect } from "react";

type PaywallViewTrackerProps = {
  contentType: string;
  matchId?: string;
};

export function PaywallViewTracker({
  contentType,
  matchId,
}: PaywallViewTrackerProps) {
  useEffect(() => {
    if (typeof window.gtag !== "function") {
      return;
    }

    window.gtag("event", "paywall_view", {
      content_type: contentType,
      match_id: matchId,
    });
  }, [contentType, matchId]);

  return null;
}
