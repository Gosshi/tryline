"use client";

import { useState } from "react";

import { AuthModal } from "@/components/auth-modal";
import { trackCtaClick, type CtaClickParams } from "@/lib/analytics";
import { getSupabaseBrowserClient } from "@/lib/auth/client";

import type { FormEvent } from "react";

type PricingFormProps = {
  analytics?: CtaClickParams;
  buttonLabel: string;
  intent?: "login" | "subscribe";
  variant?: "hero" | "inline";
};

export function PricingForm({
  analytics,
  buttonLabel,
  intent = "subscribe",
  variant = "hero",
}: PricingFormProps) {
  const [showAuth, setShowAuth] = useState(false);

  async function handlePremiumSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (analytics) {
      trackCtaClick(analytics);
    }

    const form = event.currentTarget;
    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setShowAuth(true);
      return;
    }

    form.submit();
  }

  return (
    <>
      {showAuth && (
        <AuthModal intent={intent} onClose={() => setShowAuth(false)} />
      )}
      <form
        action="/api/stripe/checkout"
        method="POST"
        onSubmit={(event) => void handlePremiumSubmit(event)}
      >
        <button
          className={[
            "rounded-full bg-[var(--color-accent)] font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2",
            variant === "hero"
              ? "px-7 py-3 text-base focus-visible:ring-white"
              : "px-4 py-2 text-sm focus-visible:ring-[var(--color-accent)]",
          ].join(" ")}
          type="submit"
        >
          {buttonLabel}
        </button>
      </form>
    </>
  );
}
