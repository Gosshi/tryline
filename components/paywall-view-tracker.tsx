"use client";

import { cloneElement, useEffect, useRef } from "react";

import { useUserState } from "@/components/user-state-provider";
import { trackPaywallView } from "@/lib/analytics";

import type { ReactElement, Ref, RefObject } from "react";

type PaywallViewTrackerProps = {
  contentType: string;
  isSample?: boolean;
  matchId?: string;
  paywallLocation?: string;
  targetRef?: RefObject<HTMLElement | null>;
  viewerType?: "anonymous" | "free";
};

type PaywallViewBoundaryProps = Omit<PaywallViewTrackerProps, "targetRef"> & {
  children: ReactElement<{ ref?: Ref<HTMLDivElement> }>;
};

export function PaywallViewTracker({
  contentType,
  isSample = false,
  matchId,
  paywallLocation,
  targetRef,
  viewerType,
}: PaywallViewTrackerProps) {
  const userState = useUserState();
  const resolvedViewerType =
    viewerType ?? (userState?.user ? "free" : "anonymous");
  const trackedTargetKey = useRef<string | null>(null);
  const trackingKey = [
    contentType,
    isSample,
    matchId ?? "",
    paywallLocation ?? "",
    resolvedViewerType,
  ].join("\u0000");

  useEffect(() => {
    if (!viewerType && userState === null) {
      return;
    }

    const track = () =>
      trackPaywallView({
        content_type: contentType,
        is_sample: isSample,
        match_id: matchId,
        paywall_location: paywallLocation,
        viewer_type: resolvedViewerType,
      });

    // Article boundaries pass a target ref and are tracked on viewport reach.
    // Chat overlays do not pass one, so their established mount measurement remains unchanged.
    if (!targetRef) {
      track();
      return;
    }

    const target = targetRef.current;
    if (
      !target ||
      typeof IntersectionObserver === "undefined" ||
      trackedTargetKey.current === trackingKey
    ) {
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (
        !entries.some((entry) => entry.isIntersecting) ||
        trackedTargetKey.current === trackingKey
      ) {
        return;
      }

      trackedTargetKey.current = trackingKey;
      track();
      observer.disconnect();
    });
    observer.observe(target);

    return () => observer.disconnect();
  }, [
    contentType,
    isSample,
    matchId,
    paywallLocation,
    resolvedViewerType,
    targetRef,
    trackingKey,
    userState,
    viewerType,
  ]);

  return null;
}

export function PaywallViewBoundary({
  children,
  ...trackerProps
}: PaywallViewBoundaryProps) {
  const targetRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <PaywallViewTracker {...trackerProps} targetRef={targetRef} />
      {cloneElement(children, { ref: targetRef })}
    </>
  );
}
