"use client";

import { useMemo, useState } from "react";

import { MatchCard } from "@/components/match-card";
import { RoundHeading } from "@/components/round-heading";

import type { MatchContentStatus } from "@/lib/db/queries/match-content";
import type { MatchListItem } from "@/lib/db/queries/matches";
import type { GroupKey } from "@/lib/format/match-groups";

type SeasonMatchGroupsProps = {
  contentStatusMap: Record<string, MatchContentStatus>;
  family?: string;
  groupedMatches: Array<[GroupKey, MatchListItem[]]>;
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-4 w-4 text-[var(--color-ink-muted)] transition-transform ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function shouldCollapseRoundGroups(
  groupedMatches: Array<[GroupKey, MatchListItem[]]>,
): boolean {
  return (
    groupedMatches.length >= 10 &&
    groupedMatches.every(([groupKey]) => groupKey.type === "round")
  );
}

export function getDefaultOpenGroupIndex(
  groupedMatches: Array<[GroupKey, MatchListItem[]]>,
  now = new Date(),
): number {
  if (groupedMatches.length === 0) {
    return -1;
  }

  const completedIndex = groupedMatches.reduce((latestIndex, [, matches], index) => {
    const allStarted = matches.every(
      (match) => new Date(match.kickoffAt).getTime() <= now.getTime(),
    );

    return allStarted ? index : latestIndex;
  }, -1);

  if (completedIndex === -1) {
    return 0;
  }

  if (completedIndex === groupedMatches.length - 1) {
    return completedIndex;
  }

  return completedIndex + 1;
}

export function SeasonMatchGroups({
  contentStatusMap,
  family,
  groupedMatches,
}: SeasonMatchGroupsProps) {
  const collapsible = shouldCollapseRoundGroups(groupedMatches);
  const defaultOpenIndex = useMemo(
    () => getDefaultOpenGroupIndex(groupedMatches),
    [groupedMatches],
  );
  const [openIndexes, setOpenIndexes] = useState<Set<number>>(
    () =>
      collapsible && defaultOpenIndex >= 0
        ? new Set([defaultOpenIndex])
        : new Set(groupedMatches.map((_, index) => index)),
  );

  return (
    <>
      {groupedMatches.map(([groupKey, roundMatches], index) => {
        const key =
          groupKey.type === "round"
            ? (groupKey.round ?? "unassigned")
            : `week-${groupKey.weekIndex}`;
        const isOpen = openIndexes.has(index);

        return (
          <section className="space-y-4" key={key}>
            {collapsible ? (
              <>
                <button
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 py-1 text-left"
                  onClick={() =>
                    setOpenIndexes((current) => {
                      const next = new Set(current);

                      if (next.has(index)) {
                        next.delete(index);
                      } else {
                        next.add(index);
                      }

                      return next;
                    })
                  }
                  type="button"
                >
                  <div className="min-w-0 flex-1">
                    <RoundHeading family={family} groupKey={groupKey} />
                  </div>
                  <ChevronIcon open={isOpen} />
                </button>
                {isOpen && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {roundMatches.map((match) => (
                      <MatchCard
                        contentStatus={
                          contentStatusMap[match.id] ?? {
                            hasPreview: false,
                            hasRecap: false,
                          }
                        }
                        key={match.id}
                        match={match}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <RoundHeading family={family} groupKey={groupKey} />
                <div className="grid gap-4 md:grid-cols-2">
                  {roundMatches.map((match) => (
                    <MatchCard
                      contentStatus={
                        contentStatusMap[match.id] ?? {
                          hasPreview: false,
                          hasRecap: false,
                        }
                      }
                      key={match.id}
                      match={match}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        );
      })}
    </>
  );
}
