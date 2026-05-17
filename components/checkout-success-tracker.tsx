"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function CheckoutSuccessTracker() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("checkout") !== "success") {
      return;
    }

    if (typeof window.gtag === "function") {
      window.gtag("event", "purchase", {
        currency: "JPY",
        value: 980,
      });
    }
  }, [searchParams]);

  return null;
}
