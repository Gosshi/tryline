type RoundHeadingProps = {
  round: number | null;
};

export function RoundHeading({ round }: RoundHeadingProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-[var(--color-rule)]" />
      <h2 className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
        {round === null ? "節未定" : `Round ${round}`}
      </h2>
      <div className="h-px flex-1 bg-[var(--color-rule)]" />
    </div>
  );
}
