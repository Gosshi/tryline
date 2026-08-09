import { parse } from "date-fns";

const KICKOFF_PATTERN =
  /(\d{1,2})(?:\/\d{1,2})*\s+([A-Za-z]+)\s+(\d{4})(?:\s*(\d{1,2}:\d{2}))?/;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function lastSundayOfMonthUtc(year: number, monthIndex: number) {
  const date = new Date(Date.UTC(year, monthIndex + 1, 0));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());

  return date;
}

function isBritishSummerTime(date: Date) {
  const year = date.getUTCFullYear();
  const startsAt = lastSundayOfMonthUtc(year, 2);
  startsAt.setUTCHours(1, 0, 0, 0);

  const endsAt = lastSundayOfMonthUtc(year, 9);
  endsAt.setUTCHours(1, 0, 0, 0);

  return date >= startsAt && date < endsAt;
}

export function parsePremiershipKickoffAt(value: string): string | null {
  const matched = normalizeWhitespace(value).match(KICKOFF_PATTERN);

  if (!matched) {
    return null;
  }

  const [, dayText, month, yearText, timeText = "00:00"] = matched;
  const dateText = `${dayText} ${month} ${yearText}`;
  const parsedDate = parse(dateText, "d MMMM yyyy", new Date());

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  const [hoursText, minutesText] = timeText.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const localDateAsUtc = new Date(
    Date.UTC(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate(),
      hours,
      minutes,
    ),
  );
  const timezoneOffset = isBritishSummerTime(localDateAsUtc) ? 1 : 0;

  return new Date(
    Date.UTC(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate(),
      hours - timezoneOffset,
      minutes,
    ),
  ).toISOString();
}
