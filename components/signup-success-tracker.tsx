"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { trackSignUp } from "@/lib/analytics";

export function SignupSuccessTracker() {
  const searchParams = useSearchParams();
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current || searchParams.get("signup") !== "success") {
      return;
    }

    sentRef.current = true;
    trackSignUp();
    const url = new URL(window.location.href);
    url.searchParams.delete("signup");
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash,
    );
  }, [searchParams]);

  return null;
}
