"use client";

import { useEffect } from "react";

import { trackPaywallView } from "@/lib/analytics";

type PaywallViewTrackerProps = {
  contentType: string;
  matchId?: string;
};

export function PaywallViewTracker({
  contentType,
  matchId,
}: PaywallViewTrackerProps) {
  useEffect(() => {
    trackPaywallView({
      content_type: contentType,
      match_id: matchId,
    });
  }, [contentType, matchId]);

  return null;
}
