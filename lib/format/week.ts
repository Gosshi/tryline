const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_WEEK_OFFSET = 8;

export type WeekRangeUtc = {
  endUtcIso: string;
  startUtcIso: string;
  weekEndJst: string;
  weekStartJst: string;
};

function formatJstDateFromUtcMs(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

function parseJstDateAsUtcDate(dateString: string): Date | null {
  if (!DATE_RE.test(dateString)) {
    return null;
  }

  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));

  if (date.toISOString().slice(0, 10) !== dateString) {
    return null;
  }

  return date;
}

export function getCurrentJstWeekStartDate(now = new Date()): string {
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  const day = jstNow.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const startJstAsUtc = Date.UTC(
    jstNow.getUTCFullYear(),
    jstNow.getUTCMonth(),
    jstNow.getUTCDate() - daysSinceMonday,
  );

  return formatJstDateFromUtcMs(startJstAsUtc);
}

export function addJstDays(dateString: string, days: number): string {
  const date = parseJstDateAsUtcDate(dateString);

  if (!date) {
    return dateString;
  }

  return formatJstDateFromUtcMs(date.getTime() + days * DAY_MS);
}

export function resolveJstWeekStartDate(
  weekStartJst?: string | null,
  now = new Date(),
): string {
  const currentWeekStart = getCurrentJstWeekStartDate(now);
  const requestedDate = weekStartJst
    ? parseJstDateAsUtcDate(weekStartJst)
    : null;

  if (!requestedDate || requestedDate.getUTCDay() !== 1) {
    return currentWeekStart;
  }

  const currentDate = parseJstDateAsUtcDate(currentWeekStart);

  if (!currentDate) {
    return currentWeekStart;
  }

  const weekOffset = Math.round(
    (requestedDate.getTime() - currentDate.getTime()) / (7 * DAY_MS),
  );

  return Math.abs(weekOffset) <= MAX_WEEK_OFFSET
    ? weekStartJst!
    : currentWeekStart;
}

export function getJstWeekRangeUtc(
  weekStartJst: string,
  now = new Date(),
): WeekRangeUtc {
  const resolvedWeekStart = resolveJstWeekStartDate(weekStartJst, now);
  const startJstAsUtc = parseJstDateAsUtcDate(resolvedWeekStart)?.getTime();

  if (startJstAsUtc === undefined) {
    return getCurrentJstWeekRangeUtc(now);
  }

  const startUtc = new Date(startJstAsUtc - JST_OFFSET_MS);
  const endUtc = new Date(startUtc.getTime() + 7 * DAY_MS);

  return {
    endUtcIso: endUtc.toISOString(),
    startUtcIso: startUtc.toISOString(),
    weekEndJst: addJstDays(resolvedWeekStart, 6),
    weekStartJst: resolvedWeekStart,
  };
}

export function getCurrentJstWeekRangeUtc(now = new Date()): WeekRangeUtc {
  return getJstWeekRangeUtc(getCurrentJstWeekStartDate(now), now);
}

export function formatJstWeekRangeLabel(weekStartJst: string): string {
  const start = parseJstDateAsUtcDate(weekStartJst);

  if (!start) {
    return "JST";
  }

  const end = new Date(start.getTime() + 6 * DAY_MS);
  const startMonth = start.getUTCMonth() + 1;
  const endMonth = end.getUTCMonth() + 1;
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();

  if (startMonth === endMonth) {
    return startMonth + "月" + startDay + "日 - " + endDay + "日 JST";
  }

  return (
    startMonth +
    "月" +
    startDay +
    "日 - " +
    endMonth +
    "月" +
    endDay +
    "日 JST"
  );
}
