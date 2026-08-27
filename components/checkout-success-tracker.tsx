"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { trackTrialStart } from "@/lib/analytics";

export function CheckoutSuccessTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("checkout") !== "success") {
      return;
    }

    trackTrialStart();
  }, [searchParams]);

  return null;
}
