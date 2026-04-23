type RoundHeadingProps = {
  round: number | null;
};

export function RoundHeading({ round }: RoundHeadingProps) {
  return (
    <h2 className="text-lg font-semibold tracking-tight text-slate-900">
      {round === null ? "節未定" : `第 ${round} 節`}
    </h2>
  );
}
