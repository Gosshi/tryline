import { previewDueUpperBound } from "./preview-window";

export const PREVIEW_MAX_LEAD_HOURS = 24;
export const RECAP_MIN_AGE_HOURS = 12;
export const RECAP_MAX_AGE_DAYS = 14;
export const RECAP_RESEARCH_DEADLINE_HOUR_JST = 20;
export const RECAP_RESEARCH_DEADLINE_MINUTE_JST = 30;
export const ASSUMED_MATCH_DURATION_HOURS = 2;

const HOUR_MS = 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * HOUR_MS;

export function previewCandidateUpperBound(now: Date): string {
  const maxLead = now.getTime() + PREVIEW_MAX_LEAD_HOURS * HOUR_MS;
  const due = Date.parse(previewDueUpperBound(now));

  return new Date(Math.min(maxLead, due)).toISOString();
}

export function recapCandidateUpperBound(now: Date): string {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const todayDeadlineJst = Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate(),
    RECAP_RESEARCH_DEADLINE_HOUR_JST,
    RECAP_RESEARCH_DEADLINE_MINUTE_JST,
  );
  const lastDeadlineJst =
    jst.getUTCHours() < RECAP_RESEARCH_DEADLINE_HOUR_JST ||
    (jst.getUTCHours() === RECAP_RESEARCH_DEADLINE_HOUR_JST &&
      jst.getUTCMinutes() < RECAP_RESEARCH_DEADLINE_MINUTE_JST)
      ? todayDeadlineJst - 24 * HOUR_MS
      : todayDeadlineJst;
  const researchBound =
    lastDeadlineJst -
    ASSUMED_MATCH_DURATION_HOURS * HOUR_MS -
    JST_OFFSET_MS;
  const minimumAgeBound = now.getTime() - RECAP_MIN_AGE_HOURS * HOUR_MS;

  return new Date(Math.min(researchBound, minimumAgeBound)).toISOString();
}
