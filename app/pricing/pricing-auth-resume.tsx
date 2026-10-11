"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { trackBeginCheckoutBeforeNavigation } from "@/lib/analytics";
import { getSupabaseBrowserClient } from "@/lib/auth/client";

export function PricingAuthResume() {
  const searchParams = useSearchParams();
  const handledRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const alreadyPremium = searchParams.get("already_premium") === "1";
    const resumeCheckout = searchParams.get("resume") === "checkout";
    if (handledRef.current || (!alreadyPremium && !resumeCheckout)) return;
    handledRef.current = true;

    const url = new URL(window.location.href);
    if (alreadyPremium) url.searchParams.delete("already_premium");
    if (resumeCheckout) url.searchParams.delete("resume");
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash,
    );

    if (alreadyPremium) {
      setMessage("すでに Premium をご利用中です。");
      return;
    }

    async function resume() {
      const {
        data: { user },
        error,
      } = await getSupabaseBrowserClient().auth.getUser();
      const form = formRef.current;
      if (error || !user || !form) return;

      setMessage("決済ページへ移動しています…");
      await trackBeginCheckoutBeforeNavigation({
        cta_id: "pricing_auth_resume",
        cta_location: "auth_resume",
        destination: "/api/stripe/checkout",
      });
      form.submit();
    }
    void resume();
  }, [searchParams]);

  return (
    <>
      {message && (
        <p role="status" className="auth-return-notice">
          {message}
        </p>
      )}
      <form ref={formRef} action="/api/stripe/checkout" method="POST" hidden />
    </>
  );
}
