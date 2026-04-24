import { type MatchStatus } from "@/lib/format/status";

export type ContentDisplayState = "pre_window" | "preparing" | "unavailable";

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

export function deriveContentState(params: {
  contentType: "preview" | "recap";
  matchStatus: MatchStatus;
  kickoffAt: Date;
  now: Date;
}): ContentDisplayState {
  const { contentType, kickoffAt, matchStatus, now } = params;

  if (matchStatus === "postponed" || matchStatus === "cancelled") {
    return "unavailable";
  }

  if (contentType === "preview") {
    const previewWindowStartAt = kickoffAt.getTime() - FORTY_EIGHT_HOURS_MS;

    if (matchStatus === "scheduled" && now.getTime() < previewWindowStartAt) {
      return "pre_window";
    }

    return "preparing";
  }

  if (matchStatus === "scheduled" || matchStatus === "in_progress") {
    return "pre_window";
  }

  return "preparing";
}
