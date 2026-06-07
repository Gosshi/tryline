const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type WeekRangeUtc = {
  endUtcIso: string;
  startUtcIso: string;
};

export function getCurrentJstWeekRangeUtc(
  now = new Date(),
): WeekRangeUtc {
  const jstNow = new Date(now.getTime() + JST_OFFSET_MS);
  const day = jstNow.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const startJstAsUtc = Date.UTC(
    jstNow.getUTCFullYear(),
    jstNow.getUTCMonth(),
    jstNow.getUTCDate() - daysSinceMonday,
  );
  const startUtc = new Date(startJstAsUtc - JST_OFFSET_MS);
  const endUtc = new Date(startUtc.getTime() + 7 * DAY_MS);

  return {
    endUtcIso: endUtc.toISOString(),
    startUtcIso: startUtc.toISOString(),
  };
}
