type MatchContentTrustStripProps = {
  hasConfirmedLineups: boolean;
  sourcedFactCount: number;
};

export function MatchContentTrustStrip({
  hasConfirmedLineups,
  sourcedFactCount,
}: MatchContentTrustStripProps) {
  const signals = [
    hasConfirmedLineups ? "ラインアップ確認済み" : null,
    sourcedFactCount > 0 ? `参照元${sourcedFactCount}件` : null,
  ].filter(Boolean);

  if (signals.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 border-t border-[var(--color-rule)] pt-4">
      <dl className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs font-semibold leading-relaxed text-[var(--color-ink-muted)]">
        <dt className="sr-only">この記事の根拠</dt>
        {signals.map((signal, index) => (
          <div className="contents" key={signal}>
            {index > 0 && (
              <span
                aria-hidden
                className="text-[var(--color-rule)]"
              >
                ・
              </span>
            )}
            <dd className="rounded-full bg-[var(--color-accent-subtle)] px-3 py-1">
              {signal}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
