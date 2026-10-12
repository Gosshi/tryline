import { afterEach, expect, it, vi } from "vitest";

import { previewCandidateUpperBound } from "@/lib/cron/content-windows";
import {
  isInPreviewResearchScope,
  isPreviewHeldForResearch,
  previewResearchDeadline,
} from "@/lib/cron/preview-research-hold";

function date(jst: string): Date {
  return new Date(`${jst}+09:00`);
}

function held(kickoff: string, now: string, hasManualPreviewFacts = false) {
  vi.setSystemTime(date(now));
  return isPreviewHeldForResearch({
    kickoffAt: date(kickoff),
    now: new Date(),
    hasManualPreviewFacts,
  });
}

afterEach(() => vi.useRealTimers());

it("releases Saturday 13:00 after Friday research facts arrive", () => {
  vi.useFakeTimers();
  expect(held("2026-10-17T13:00:00", "2026-10-16T21:00:00")).toBe(true);
  expect(held("2026-10-17T13:00:00", "2026-10-16T21:00:00", true)).toBe(false);
});

it("keeps the D030 24-hour limit for Saturday 23:00", () => {
  vi.useFakeTimers();
  expect(held("2026-10-17T23:00:00", "2026-10-16T21:00:00", true)).toBe(false);
  expect(date("2026-10-17T23:00:00").toISOString() >= previewCandidateUpperBound(date("2026-10-16T21:00:00"))).toBe(true);
  expect(date("2026-10-17T23:00:00").toISOString() < previewCandidateUpperBound(date("2026-10-16T23:01:00"))).toBe(true);
});

it("releases a Monday 04:00 preview once Saturday research facts exist", () => {
  vi.useFakeTimers();
  expect(held("2026-10-19T04:00:00", "2026-10-18T15:00:00", true)).toBe(false);
});

it("releases an unresearched Saturday match at Friday 22:00 exactly", () => {
  vi.useFakeTimers();
  expect(held("2026-10-17T13:00:00", "2026-10-16T21:59:59")).toBe(true);
  expect(held("2026-10-17T13:00:00", "2026-10-16T22:00:00")).toBe(false);
});

it("does not hold a Wednesday match", () => {
  vi.useFakeTimers();
  expect(held("2026-10-21T19:00:00", "2026-10-20T15:00:00")).toBe(false);
});

it("ends Monday research scope at 12:00 JST", () => {
  expect(isInPreviewResearchScope(date("2026-10-19T11:59:00"))).toBe(true);
  expect(isInPreviewResearchScope(date("2026-10-19T12:00:00"))).toBe(false);
});

it("uses Thursday 22:00 for a Friday 00:30 kickoff", () => {
  vi.useFakeTimers();
  const kickoff = date("2026-10-16T00:30:00");
  expect(isInPreviewResearchScope(kickoff)).toBe(true);
  expect(previewResearchDeadline(kickoff)).toEqual(date("2026-10-15T22:00:00"));
  expect(held("2026-10-16T00:30:00", "2026-10-15T21:00:00")).toBe(true);
});
