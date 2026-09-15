// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CompetitionCalendarLinks } from "@/components/competition-calendar-links";
import { trackCtaClick } from "@/lib/analytics";

vi.mock("@/lib/analytics", () => ({
  trackCtaClick: vi.fn(),
}));

const props = {
  competitionSlug: "premiership",
  icalHref: "https://www.trylinerugby.com/api/calendar/premiership-2025-26.ics",
  season: "2025-26",
  webcalHref: "webcal://www.trylinerugby.com/api/calendar/premiership-2025-26.ics",
};

describe("CompetitionCalendarLinks", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the webcal CTA with its fixed analytics payload", () => {
    render(<CompetitionCalendarLinks {...props} />);

    const link = screen.getByRole("link", {
      name: "この大会の日程をカレンダーに追加",
    });

    expect(link).toHaveAttribute("href", props.webcalHref);
    fireEvent.click(link);

    expect(trackCtaClick).toHaveBeenCalledTimes(1);
    expect(trackCtaClick).toHaveBeenCalledWith({
      competition_slug: "premiership",
      cta_id: "hub_calendar_subscribe",
      cta_location: "hub_hero",
      destination: "calendar_subscription",
      label: "この大会の日程をカレンダーに追加",
      season: "2025-26",
    });
  });

  it("renders the iCal CTA with its fixed analytics payload", () => {
    render(<CompetitionCalendarLinks {...props} />);

    const link = screen.getByRole("link", { name: "iCal URL を開く" });

    expect(link).toHaveAttribute("href", props.icalHref);
    fireEvent.click(link);

    expect(trackCtaClick).toHaveBeenCalledTimes(1);
    expect(trackCtaClick).toHaveBeenCalledWith({
      competition_slug: "premiership",
      cta_id: "hub_calendar_ical_url",
      cta_location: "hub_hero",
      destination: "calendar_ical_url",
      label: "iCal URL を開く",
      season: "2025-26",
    });
  });

  it("does not prevent the default anchor navigation when analytics fails", () => {
    vi.mocked(trackCtaClick).mockImplementationOnce(() => {
      throw new Error("gtag is unavailable");
    });
    render(<CompetitionCalendarLinks {...props} />);
    const link = screen.getByRole("link", {
      name: "この大会の日程をカレンダーに追加",
    });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    link.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(trackCtaClick).toHaveBeenCalledTimes(1);
  });
});
