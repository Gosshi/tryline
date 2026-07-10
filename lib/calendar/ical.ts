import { formatCompetitionTitle } from "@/lib/format/competition";
import { getTeamDisplayName } from "@/lib/format/team";
import { SITE_URL } from "@/lib/site";

import type { CalendarMatch } from "@/lib/db/queries/matches";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DEFAULT_EVENT_DURATION_MS = 2 * 60 * 60 * 1000;

type CalendarFeedOptions = {
  generatedAt?: Date;
  siteUrl?: string;
  title?: string;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatUtcDateTime(date: Date): string {
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    "Z",
  ].join("");
}

function formatJstDateTime(date: Date): string {
  const jstDate = new Date(date.getTime() + JST_OFFSET_MS);

  return [
    jstDate.getUTCFullYear(),
    pad(jstDate.getUTCMonth() + 1),
    pad(jstDate.getUTCDate()),
    "T",
    pad(jstDate.getUTCHours()),
    pad(jstDate.getUTCMinutes()),
    pad(jstDate.getUTCSeconds()),
  ].join("");
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function cleanUrlBase(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, "");
}

function buildMatchTitle(match: CalendarMatch): string {
  return `${getTeamDisplayName(match.homeTeam)} vs ${getTeamDisplayName(
    match.awayTeam,
  )}`;
}

function buildMatchDescription(match: CalendarMatch, matchUrl: string): string {
  const competitionTitle = formatCompetitionTitle(
    match.competition,
    match.competition.season,
  );
  const parts = [
    competitionTitle,
    match.venue ? `会場: ${match.venue}` : null,
    `Tryline: ${matchUrl}`,
  ].filter(Boolean);

  return parts.join("\n");
}

export function buildMatchCalendarIcs(
  matches: CalendarMatch[],
  options: CalendarFeedOptions = {},
): string {
  const generatedAt = options.generatedAt ?? new Date();
  const siteUrl = cleanUrlBase(options.siteUrl ?? SITE_URL);
  const title = options.title ?? "Tryline 海外ラグビー試合予定";
  const stamp = formatUtcDateTime(generatedAt);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tryline//Match Calendar//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(title)}`,
    "X-WR-TIMEZONE:Asia/Tokyo",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Tokyo",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0900",
    "TZOFFSETTO:+0900",
    "TZNAME:JST",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const match of matches) {
    const kickoff = new Date(match.kickoffAt);
    const matchUrl = `${siteUrl}/matches/${match.id}`;
    const summary = buildMatchTitle(match);
    const description = buildMatchDescription(match, matchUrl);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${match.id}@trylinerugby.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Tokyo:${formatJstDateTime(kickoff)}`,
      `DTEND;TZID=Asia/Tokyo:${formatJstDateTime(
        new Date(kickoff.getTime() + DEFAULT_EVENT_DURATION_MS),
      )}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      `URL:${matchUrl}`,
      "STATUS:CONFIRMED",
    );

    if (match.venue) {
      lines.push(`LOCATION:${escapeIcsText(match.venue)}`);
    }

    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return `${lines.join("\r\n")}\r\n`;
}
