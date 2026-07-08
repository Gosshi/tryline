"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function SignupSuccessTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("signup") !== "success") {
      return;
    }

    if (typeof window.gtag === "function") {
      window.gtag("event", "sign_up");
    }
  }, [searchParams]);

  return null;
}
