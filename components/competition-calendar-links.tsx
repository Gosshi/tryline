"use client";

import { trackCtaClick } from "@/lib/analytics";

type CompetitionCalendarLinksProps = {
  competitionSlug: string;
  icalHref: string;
  season: string;
  webcalHref: string;
};

const WEB_CALENDAR_LABEL = "この大会の日程をカレンダーに追加";
const ICAL_URL_LABEL = "iCal URL を開く";

export function CompetitionCalendarLinks({
  competitionSlug,
  icalHref,
  season,
  webcalHref,
}: CompetitionCalendarLinksProps) {
  function trackCalendarClick(params: {
    cta_id: "hub_calendar_ical_url" | "hub_calendar_subscribe";
    destination: "calendar_ical_url" | "calendar_subscription";
    label: string;
  }) {
    try {
      trackCtaClick({
        ...params,
        competition_slug: competitionSlug,
        cta_location: "hub_hero",
        season,
      });
    } catch {
      // Analytics failures must never block the anchor's native navigation.
    }
  }

  return (
    <>
      <a
        className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--color-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
        href={webcalHref}
        onClick={() => {
          trackCalendarClick({
            cta_id: "hub_calendar_subscribe",
            destination: "calendar_subscription",
            label: WEB_CALENDAR_LABEL,
          });
        }}
      >
        {WEB_CALENDAR_LABEL}
      </a>
      <a
        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2"
        href={icalHref}
        onClick={() => {
          trackCalendarClick({
            cta_id: "hub_calendar_ical_url",
            destination: "calendar_ical_url",
            label: ICAL_URL_LABEL,
          });
        }}
      >
        {ICAL_URL_LABEL}
      </a>
    </>
  );
}
