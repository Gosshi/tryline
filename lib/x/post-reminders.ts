import { previewNotificationSlot } from "@/lib/push/notifications";

export const CLUB_COMPETITION_FAMILIES = [
  "league-one",
  "premiership",
  "super-rugby-pacific",
  "top-14",
  "urc",
] as const;

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function isInternationalCompetitionFamily(
  family: string | null,
): boolean {
  return (
    family !== null &&
    !CLUB_COMPETITION_FAMILIES.includes(
      family as (typeof CLUB_COMPETITION_FAMILIES)[number],
    )
  );
}

export function prematchReminderDueAt(kickoffAt: Date): Date {
  const dueAt = new Date(kickoffAt.getTime() - THREE_HOURS_MS);
  const jstDueAt = new Date(dueAt.getTime() + JST_OFFSET_MS);
  const jstHour = jstDueAt.getUTCHours();

  if (jstHour >= 0 && jstHour < 8) {
    return previewNotificationSlot(kickoffAt);
  }

  return dueAt;
}
