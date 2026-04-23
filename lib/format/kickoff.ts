function getFormatterParts(
  kickoffAtUtc: string,
  options: {
    locale: string;
    timeZone: string;
  },
) {
  const formatter = new Intl.DateTimeFormat(options.locale, {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: options.timeZone,
    timeZoneName: "short",
    weekday: "short",
    year: "numeric",
  });

  const parts = formatter.formatToParts(new Date(kickoffAtUtc));

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function formatFromParts(parts: Record<string, string>) {
  return `${parts.year}-${parts.month}-${parts.day} (${parts.weekday}) ${parts.hour}:${parts.minute} ${parts.timeZoneName}`;
}

export function formatKickoffJst(kickoffAtUtc: string): string {
  return formatFromParts(
    getFormatterParts(kickoffAtUtc, {
      locale: "ja-JP",
      timeZone: "Asia/Tokyo",
    }),
  );
}

export function formatKickoffLocal(
  kickoffAtUtc: string,
  ianaTimezone = "Europe/London",
): string {
  return formatFromParts(
    getFormatterParts(kickoffAtUtc, {
      locale: "en-GB",
      timeZone: ianaTimezone,
    }),
  );
}
