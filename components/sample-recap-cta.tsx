"use client";

import Link from "next/link";

import { trackCtaClick, trackEvent } from "@/lib/analytics";

type SampleRecapCtaProps = {
  language?: "ja" | "en";
  matchId: string;
};

export function SampleRecapCta({
  language = "ja",
  matchId,
}: SampleRecapCtaProps) {
  const isEnglish = language === "en";

  function handleClick() {
    const params = {
      destination: "pricing",
      language,
      match_id: matchId,
    } as const;

    trackEvent("sample_recap_cta_click", params);
    trackCtaClick({
      ...params,
      content_type: "recap",
      cta_id: "sample_recap_pricing",
      cta_location: "sample_recap_cta",
      is_sample: true,
      label: isEnglish ? "View Premium" : "7日間無料で試す",
    });
  }

  return (
    <aside className="border-[var(--color-accent)]/25 bg-[var(--color-accent)]/5 rounded-xl border px-5 py-4">
      <p className="text-sm font-semibold text-[var(--color-ink)]">
        {isEnglish
          ? "This full review is a free sample."
          : "これは無料サンプルのレビューです。"}
      </p>
      <p className="mt-1 text-sm leading-6 text-[var(--color-ink-muted)]">
        {isEnglish
          ? "Premium unlocks full reviews for every match, plus match chat. Start from the pricing page."
          : "この品質で、他の試合のレビュー全文と試合 AI チャットも利用できます。Premium は ¥980/月、初回7日間無料です。"}
      </p>
      <Link
        className="mt-3 inline-flex w-fit rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        href="/pricing"
        onClick={handleClick}
      >
        {isEnglish ? "View Premium" : "7日間無料で試す"}
      </Link>
    </aside>
  );
}
