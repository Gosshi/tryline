type RoundHeadingProps = {
  round: number | null;
};

export function RoundHeading({ round }: RoundHeadingProps) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
        {round === null ? "節未定" : `Round ${round}`}
      </h2>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
