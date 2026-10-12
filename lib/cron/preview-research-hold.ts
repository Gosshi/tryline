export const PREVIEW_RESEARCH_DEADLINE_HOUR_JST = 22;
export const MONDAY_EARLY_CUTOFF_HOUR_JST = 12;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isInPreviewResearchScope(kickoffAt: Date): boolean {
  const jst = new Date(kickoffAt.getTime() + JST_OFFSET_MS);
  const day = jst.getUTCDay();
  return (
    day === 5 ||
    day === 6 ||
    day === 0 ||
    (day === 1 && jst.getUTCHours() < MONDAY_EARLY_CUTOFF_HOUR_JST)
  );
}

export function previewResearchDeadline(kickoffAt: Date): Date {
  const jst = new Date(kickoffAt.getTime() + JST_OFFSET_MS);
  const kickoffDayJst = Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate(),
  );
  return new Date(
    kickoffDayJst - DAY_MS +
      PREVIEW_RESEARCH_DEADLINE_HOUR_JST * 60 * 60 * 1000 -
      JST_OFFSET_MS,
  );
}

export function isPreviewHeldForResearch(input: {
  kickoffAt: Date;
  now: Date;
  hasManualPreviewFacts: boolean;
}): boolean {
  return (
    isInPreviewResearchScope(input.kickoffAt) &&
    !input.hasManualPreviewFacts &&
    input.now.getTime() < previewResearchDeadline(input.kickoffAt).getTime()
  );
}
