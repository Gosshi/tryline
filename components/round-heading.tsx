import type { GroupKey } from "@/lib/format/match-groups";

type RoundHeadingProps = {
  groupKey: GroupKey;
};

function formatDateShort(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);

  return new Intl.DateTimeFormat("ja-JP", {
    day: "numeric",
    month: "numeric",
  }).format(date);
}

export function RoundHeading({ groupKey }: RoundHeadingProps) {
  const label =
    groupKey.type === "week"
      ? `第${groupKey.weekIndex}節 - ${
          groupKey.startDate === groupKey.endDate
            ? formatDateShort(groupKey.startDate)
            : `${formatDateShort(groupKey.startDate)}〜${formatDateShort(groupKey.endDate)}`
        }`
      : groupKey.round === null
        ? "節未定"
        : `Round ${groupKey.round}`;

  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-[var(--color-rule)]" />
      <h2 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
        {label}
      </h2>
      <div className="h-px flex-1 bg-[var(--color-rule)]" />
    </div>
  );
}
