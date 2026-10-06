import { load } from "cheerio";
import { parse } from "date-fns";

import { parseWikipediaSixNationsHtml } from "./wikipedia-six-nations";

const RWC_2027_VENUE_TIMEZONES: Record<string, string> = {
  Sydney: "Australia/Sydney",
  Newcastle: "Australia/Sydney",
  Melbourne: "Australia/Melbourne",
  Brisbane: "Australia/Brisbane",
  Townsville: "Australia/Brisbane",
  Adelaide: "Australia/Adelaide",
  Perth: "Australia/Perth",
};

export function resolveRwc2027VenueTimeZone(
  venue: string | null,
): string | null {
  if (!venue) {
    return null;
  }

  const city = Object.keys(RWC_2027_VENUE_TIMEZONES).find((name) =>
    new RegExp(`\\b${name}\\b`, "i").test(venue),
  );

  return city ? RWC_2027_VENUE_TIMEZONES[city]! : null;
}

function localKickoffToUtc(
  dateText: string,
  timeText: string,
  timeZone: string,
): string {
  const date = parse(dateText, "d MMMM yyyy", new Date());
  const [hours, minutes] = timeText.split(":").map(Number);

  if (
    Number.isNaN(date.getTime()) ||
    hours === undefined ||
    minutes === undefined ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(
      `Unable to parse RWC 2027 kickoff: ${dateText} ${timeText}`,
    );
  }

  const wallTimestamp = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hours,
    minutes,
  );
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  });
  let utcTimestamp = wallTimestamp;

  // Re-evaluate at the UTC candidate: its offset can differ from the initial
  // wall-clock-as-UTC probe on the day daylight saving changes.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offsetText =
      formatter
        .formatToParts(new Date(utcTimestamp))
        .find((part) => part.type === "timeZoneName")?.value ?? "";
    const offset = offsetText.match(/^GMT([+-])(\d{2}):(\d{2})$/);

    if (!offset) {
      throw new Error(
        `Unable to resolve RWC 2027 timezone offset: ${timeZone} ${offsetText}`,
      );
    }

    const offsetMinutes =
      (Number(offset[2]) * 60 + Number(offset[3])) *
      (offset[1] === "+" ? 1 : -1);
    const nextTimestamp = wallTimestamp - offsetMinutes * 60 * 1000;

    if (nextTimestamp === utcTimestamp) {
      return new Date(utcTimestamp).toISOString();
    }

    utcTimestamp = nextTimestamp;
  }

  throw new Error(
    `Unable to resolve RWC 2027 local kickoff: ${dateText} ${timeText} ${timeZone}`,
  );
}

export function parseWikipediaRwc2027Html(
  html: string,
  wikipediaUrl: string | null = null,
) {
  return parseWikipediaSixNationsHtml(html, wikipediaUrl).map((match) => {
    const timeZone = resolveRwc2027VenueTimeZone(match.venue);
    const $ = load(match.rawHtml);
    const kickoffText = $("table").first().text().replace(/\s+/g, " ").trim();
    const localKickoff = kickoffText.match(
      /(\d{1,2} [A-Za-z]+ \d{4})\s*(\d{1,2}:\d{2})/,
    );

    return {
      ...match,
      kickoffAt:
        timeZone && localKickoff
          ? localKickoffToUtc(localKickoff[1]!, localKickoff[2]!, timeZone)
          : null,
    };
  });
}

export const RWC_TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  Argentina: "argentina",
  Australia: "australia",
  Chile: "chile",
  England: "england",
  Fiji: "fiji",
  France: "france",
  Georgia: "georgia",
  Ireland: "ireland",
  Italy: "italy",
  Japan: "japan",
  Namibia: "namibia",
  "New Zealand": "new-zealand",
  Portugal: "portugal",
  Romania: "romania",
  Samoa: "samoa",
  Scotland: "scotland",
  "South Africa": "south-africa",
  Tonga: "tonga",
  Uruguay: "uruguay",
  Wales: "wales",
};

export const RWC_2023_POOL_ASSIGNMENTS: Record<string, string> = {
  argentina: "Pool D",
  australia: "Pool C",
  chile: "Pool D",
  england: "Pool D",
  fiji: "Pool C",
  france: "Pool A",
  georgia: "Pool C",
  ireland: "Pool B",
  italy: "Pool A",
  japan: "Pool D",
  namibia: "Pool A",
  "new-zealand": "Pool A",
  portugal: "Pool C",
  romania: "Pool B",
  samoa: "Pool D",
  scotland: "Pool B",
  "south-africa": "Pool B",
  tonga: "Pool B",
  uruguay: "Pool A",
  wales: "Pool C",
};

export const RWC_2023_WIKIPEDIA_URL =
  "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup";
export const RWC_2023_POOL_PAGE_URLS: Record<string, string> = {
  "Pool A": "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup_Pool_A",
  "Pool B": "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup_Pool_B",
  "Pool C": "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup_Pool_C",
  "Pool D": "https://en.wikipedia.org/wiki/2023_Rugby_World_Cup_Pool_D",
};
export const RWC_2023_COMPETITION_SLUG = "rwc-2023";
export const RWC_2023_FAMILY = "rwc";
export const RWC_2023_SEASON = "2023";

export const RWC_2027_WIKIPEDIA_URL =
  "https://en.wikipedia.org/wiki/2027_Men%27s_Rugby_World_Cup";
export const RWC_2027_POOL_PAGE_URLS: Record<string, string> = {
  "Pool A": "https://en.wikipedia.org/wiki/2027_Men%27s_Rugby_World_Cup_Pool_A",
  "Pool B": "https://en.wikipedia.org/wiki/2027_Men%27s_Rugby_World_Cup_Pool_B",
  "Pool C": "https://en.wikipedia.org/wiki/2027_Men%27s_Rugby_World_Cup_Pool_C",
  "Pool D": "https://en.wikipedia.org/wiki/2027_Men%27s_Rugby_World_Cup_Pool_D",
  "Pool E": "https://en.wikipedia.org/wiki/2027_Men%27s_Rugby_World_Cup_Pool_E",
  "Pool F": "https://en.wikipedia.org/wiki/2027_Men%27s_Rugby_World_Cup_Pool_F",
};
export const RWC_2027_COMPETITION_SLUG = "rwc-2027";
export const RWC_2027_SEASON = "2027";
export const RWC_2027_SOURCE = "wikipedia";

export const RWC_2027_POOL_ASSIGNMENTS: Record<string, string> = {
  argentina: "Pool C",
  australia: "Pool A",
  canada: "Pool C",
  chile: "Pool A",
  england: "Pool F",
  fiji: "Pool C",
  france: "Pool E",
  georgia: "Pool B",
  "hong-kong-china": "Pool A",
  ireland: "Pool D",
  italy: "Pool B",
  japan: "Pool E",
  "new-zealand": "Pool A",
  portugal: "Pool D",
  romania: "Pool B",
  samoa: "Pool E",
  scotland: "Pool D",
  "south-africa": "Pool B",
  spain: "Pool C",
  tonga: "Pool F",
  uruguay: "Pool D",
  usa: "Pool E",
  wales: "Pool F",
  zimbabwe: "Pool F",
};

export const RWC_2027_TEAM_SLUG_BY_WIKIPEDIA_NAME: Record<string, string> = {
  ...RWC_TEAM_SLUG_BY_WIKIPEDIA_NAME,
  Canada: "canada",
  Chile: "chile",
  "Hong Kong": "hong-kong-china",
  "Hong Kong China": "hong-kong-china",
  Spain: "spain",
  USA: "usa",
  "United States": "usa",
  Zimbabwe: "zimbabwe",
};

export function resolveRwcTeamSlug(teamName: string): string {
  const slug = RWC_TEAM_SLUG_BY_WIKIPEDIA_NAME[teamName];

  if (!slug) {
    throw new Error(`Unknown RWC 2023 team name: ${teamName}`);
  }

  return slug;
}

export function resolveRwc2027TeamSlug(teamName: string): string {
  const slug = RWC_2027_TEAM_SLUG_BY_WIKIPEDIA_NAME[teamName];

  if (!slug) {
    throw new Error(`Unknown RWC 2027 team name: ${teamName}`);
  }

  return slug;
}
