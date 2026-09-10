"use client";

import { useEffect } from "react";

import { trackNewsletterConfirmed } from "@/lib/analytics";

export function NewsletterConfirmedTracker({ completed }: { completed: boolean }) {
  useEffect(() => {
    if (!completed) {
      return;
    }

    trackNewsletterConfirmed();
    window.history.replaceState(null, "", "/newsletter/confirmed");
  }, [completed]);

  return null;
}
