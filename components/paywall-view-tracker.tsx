"use client";

import { useEffect } from "react";

import { useUserState } from "@/components/user-state-provider";
import { trackPaywallView } from "@/lib/analytics";

type PaywallViewTrackerProps = {
  contentType: string;
  isSample?: boolean;
  matchId?: string;
  paywallLocation?: string;
  viewerType?: "anonymous" | "free";
};

export function PaywallViewTracker({
  contentType,
  isSample = false,
  matchId,
  paywallLocation,
  viewerType,
}: PaywallViewTrackerProps) {
  const userState = useUserState();
  const resolvedViewerType = viewerType ?? (userState?.user ? "free" : "anonymous");

  useEffect(() => {
    if (!viewerType && userState === null) {
      return;
    }

    trackPaywallView({
      content_type: contentType,
      is_sample: isSample,
      match_id: matchId,
      paywall_location: paywallLocation,
      viewer_type: resolvedViewerType,
    });
  }, [contentType, isSample, matchId, paywallLocation, resolvedViewerType, userState, viewerType]);

  return null;
}
