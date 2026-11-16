import type { MatchBroadcast } from "@/lib/db/queries/match-broadcasts";

export function formatBroadcastVerifiedDate(
  broadcasts: MatchBroadcast[],
): string {
  const latestVerifiedAt = broadcasts
    .map((broadcast) => broadcast.verifiedAt)
    .sort()
    .at(-1);

  if (!latestVerifiedAt) {
    return "";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    month: "numeric",
    timeZone: "Asia/Tokyo",
  }).format(new Date(latestVerifiedAt));
}
