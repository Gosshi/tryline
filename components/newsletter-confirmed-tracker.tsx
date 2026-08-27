"use client";

import { useEffect } from "react";

import { trackNewsletterConfirmed } from "@/lib/analytics";

export function NewsletterConfirmedTracker() {
  useEffect(() => {
    trackNewsletterConfirmed();
  }, []);

  return null;
}
