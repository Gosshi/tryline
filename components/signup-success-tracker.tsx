"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { trackSignUp } from "@/lib/analytics";

export function SignupSuccessTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("signup") !== "success") {
      return;
    }

    trackSignUp();
  }, [searchParams]);

  return null;
}
