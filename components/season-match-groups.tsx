"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { MatchCard } from "@/components/match-card";
import { RoundHeading } from "@/components/round-heading";

import type { MatchContentStatus } from "@/lib/db/queries/match-content";
import type { MatchListItem } from "@/lib/db/queries/matches";
import type { GroupKey } from "@/lib/format/match-groups";

type SeasonMatchGroupsProps = {
  contentStatusMap: Record<string, MatchContentStatus>;
  family?: string;
  groupedMatches: Array<[GroupKey, MatchListItem[]]>;
  roundHubBasePath?: string;
};

const ROUND_FILTERS = [
  { label: "全試合", value: "all" },
  { label: "Pool A", value: "pool-a" },
  { label: "Pool B", value: "pool-b" },
  { label: "Pool C", value: "pool-c" },
  { label: "Pool D", value: "pool-d" },
  { label: "ノックアウト", value: "knockout" },
] as const;

type RoundFilterValue = (typeof ROUND_FILTERS)[number]["value"];

type MatchClassification = "test" | "tour";

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

  const completedIndex = groupedMatches.reduce(
    (latestIndex, [, matches], index) => {
      const allStarted = matches.every(
        (match) => new Date(match.kickoffAt).getTime() <= now.getTime(),
      );

      return allStarted ? index : latestIndex;
    },
    -1,
  );

  if (completedIndex === -1) {
    return 0;
  }

  if (completedIndex === groupedMatches.length - 1) {
    return completedIndex;
  }

  return completedIndex + 1;
}

export function getDefaultOpenGroupIndexes(
  groupedMatches: Array<[GroupKey, MatchListItem[]]>,
  now = new Date(),
): Set<number> {
  if (groupedMatches.length === 0) {
    return new Set();
  }

  const center = getDefaultOpenGroupIndex(groupedMatches, now);

  if (center < 0) {
    return new Set([0]);
  }

  return new Set(
    [center - 1, center, center + 1].filter(
      (index) => index >= 0 && index < groupedMatches.length,
    ),
  );
}

export function SeasonMatchGroups({
  contentStatusMap,
  family,
  groupedMatches,
  roundHubBasePath,
}: SeasonMatchGroupsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const roundParam = searchParams.get("round");
  const selectedRound = isRoundFilterValue(roundParam) ? roundParam : "all";
  const totalMatches = groupedMatches.reduce(
    (sum, [, matches]) => sum + matches.length,
    0,
  );
  const showRoundFilter = totalMatches >= 20;
  const visibleGroups = showRoundFilter
    ? filterGroupsByRound(groupedMatches, selectedRound)
    : groupedMatches;
  const collapsible = shouldCollapseRoundGroups(groupedMatches);
  const defaultOpenIndexes = useMemo(
    () => getDefaultOpenGroupIndexes(visibleGroups),
    [visibleGroups],
  );
  const defaultScrollIndex = useMemo(() => {
    const indexes = [...defaultOpenIndexes].sort((left, right) => left - right);

    return indexes[Math.floor(indexes.length / 2)] ?? -1;
  }, [defaultOpenIndexes]);
  const didAutoScroll = useRef(false);
  const [openIndexes, setOpenIndexes] = useState<Set<number>>(() =>
    collapsible
      ? defaultOpenIndexes
      : new Set(visibleGroups.map((_, index) => index)),
  );

  useEffect(() => {
    setOpenIndexes(
      collapsible
        ? defaultOpenIndexes
        : new Set(visibleGroups.map((_, index) => index)),
    );
  }, [collapsible, defaultOpenIndexes, visibleGroups]);

  useEffect(() => {
    if (!collapsible || didAutoScroll.current || defaultScrollIndex < 0) {
      return;
    }

    const target = document.querySelector<HTMLElement>(
      `[data-round-index="${defaultScrollIndex}"]`,
    );

    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    didAutoScroll.current = true;
  }, [collapsible, defaultScrollIndex]);

  return (
    <>
      {showRoundFilter && (
        <div
          aria-label="ラウンドで絞り込み"
          className="flex gap-2 overflow-x-auto pb-1"
          role="tablist"
        >
          {ROUND_FILTERS.map((filter) => {
            const selected = selectedRound === filter.value;

            return (
              <button
                aria-selected={selected}
                className={
                  selected
                    ? "shrink-0 rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-xs font-bold text-white"
                    : "shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-ink-muted)] transition-colors hover:border-slate-300 hover:text-[var(--color-ink)]"
                }
                key={filter.value}
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString());

                  if (filter.value === "all") {
                    params.delete("round");
                  } else {
                    params.set("round", filter.value);
                  }

                  const query = params.toString();
                  router.push(query ? `${pathname}?${query}` : pathname, {
                    scroll: false,
                  });
                }}
                role="tab"
                type="button"
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      )}

      {visibleGroups.map(([groupKey, roundMatches], index) => {
        const key =
          groupKey.type === "round"
            ? (groupKey.round ?? groupKey.roundName ?? "unassigned")
            : `week-${groupKey.weekIndex}`;
        const isOpen = openIndexes.has(index);
        const roundHubHref = getRoundHubHref(groupKey, roundHubBasePath);
        const roundHubRound = groupKey.type === "round" ? groupKey.round : null;

        return (
          <section className="space-y-4" key={key}>
            {collapsible ? (
              <>
                <button
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 py-1 text-left"
                  data-round-index={index}
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
                {roundHubHref && (
                  <RoundHubLink href={roundHubHref} round={roundHubRound} />
                )}
                <div
                  className={isOpen ? "grid gap-4 md:grid-cols-2" : "hidden"}
                >
                  {roundMatches.map((match) => (
                    <ClassifiedMatchCard
                      contentStatus={contentStatusMap[match.id]}
                      family={family}
                      key={match.id}
                      match={match}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <RoundHeading family={family} groupKey={groupKey} />
                  {roundHubHref && (
                    <div className="text-center">
                      <RoundHubLink
                        href={roundHubHref}
                        round={roundHubRound}
                      />
                    </div>
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {roundMatches.map((match) => (
                    <ClassifiedMatchCard
                      contentStatus={contentStatusMap[match.id]}
                      family={family}
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

export function getMatchClassification(
  family: string | undefined,
  match: MatchListItem,
): MatchClassification | null {
  if (family !== "greatest-rivalry") {
    return null;
  }

  if (match.homeTeam.kind === "national" && match.awayTeam.kind === "national") {
    return "test";
  }

  if (match.homeTeam.kind === "club" || match.awayTeam.kind === "club") {
    return "tour";
  }

  return null;
}

function ClassifiedMatchCard({
  contentStatus,
  family,
  match,
}: {
  contentStatus: MatchContentStatus | undefined;
  family: string | undefined;
  match: MatchListItem;
}) {
  const classification = getMatchClassification(family, match);
  const defaultContentStatus = {
    hasPreview: false,
    hasRecap: false,
  };

  if (!classification) {
    return <MatchCard contentStatus={contentStatus ?? defaultContentStatus} match={match} />;
  }

  const isTestMatch = classification === "test";

  return (
    <div
      className={
        isTestMatch
          ? "rounded-xl border-2 border-[var(--color-accent)] bg-white p-1.5 shadow-md"
          : "rounded-xl border border-slate-200 bg-slate-50 p-1"
      }
      data-match-type={classification}
    >
      <div className="flex items-center justify-between px-2 pb-1 pt-0.5">
        <span
          className={
            isTestMatch
              ? "rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[10px] font-black tracking-wide text-white"
              : "rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold tracking-wide text-slate-600"
          }
        >
          {isTestMatch ? "テストマッチ" : "ツアー戦"}
        </span>
        {isTestMatch && (
          <span className="text-[10px] font-semibold text-[var(--color-accent)]">
            代表戦
          </span>
        )}
      </div>
      <MatchCard contentStatus={contentStatus ?? defaultContentStatus} match={match} />
    </div>
  );
}

function getRoundHubHref(
  groupKey: GroupKey,
  roundHubBasePath: string | undefined,
): string | null {
  if (
    !roundHubBasePath ||
    groupKey.type !== "round" ||
    groupKey.round === null
  ) {
    return null;
  }

  return `${roundHubBasePath}/round/${groupKey.round}`;
}

function RoundHubLink({ href, round }: { href: string; round: number | null }) {
  return (
    <Link
      className="inline-flex text-xs font-semibold text-[var(--color-accent)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      href={href}
    >
      {round === null ? "この節のページ" : `第${round}節の結果・日程 →`}
    </Link>
  );
}

function isRoundFilterValue(value: string | null): value is RoundFilterValue {
  return ROUND_FILTERS.some((filter) => filter.value === value);
}

function normalizeRoundLabel(value: string | null): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function filterGroupsByRound(
  groupedMatches: Array<[GroupKey, MatchListItem[]]>,
  filter: RoundFilterValue,
): Array<[GroupKey, MatchListItem[]]> {
  if (filter === "all") {
    return groupedMatches;
  }

  return groupedMatches.filter(([groupKey, matches]) => {
    const labels = [
      groupKey.type === "round" ? groupKey.roundName : null,
      ...matches.map((match) => match.roundName),
    ].map(normalizeRoundLabel);
    const isPool = labels.some((label) => label.startsWith("pool-"));

    if (filter === "knockout") {
      return !isPool;
    }

    return labels.some((label) => label === filter || label.startsWith(filter));
  });
}
